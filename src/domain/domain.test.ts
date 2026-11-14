import { describe, expect, it } from "vitest";
import { classifyAudioFile, isQuotaError, metadataFromFilename } from "./import-policy";
import { availabilityFor, availabilityLabels } from "./labels";
import { moveItem, orderedItems, reorderItems } from "./playlist";
import { missingLocalTracks, shellUpdatePlan } from "./reconcile";
import { assertSameProfile, authorizeCloudRequest, visibleTo } from "./ownership";
import { applyOps, resolvePlaylistConflict, type SyncOp } from "./sync";
import { contentRangeHeader, parseByteRange } from "./http-range";
import { redactLog } from "./redact";
import { sha256Hex } from "./hash";
import { searchMockCatalogue } from "./sources";
import { driveConnection, safeDriveFilename, uploadDriveFile } from "./drive";
import type { PlaylistItem } from "./types";

const items: PlaylistItem[] = [
  { id: "a", playlistId: "p", trackId: "t1", position: 0 },
  { id: "b", playlistId: "p", trackId: "t2", position: 1 },
  { id: "c", playlistId: "p", trackId: "t3", position: 2 },
];

describe("import", () => {
  it("accepts wav and rejects text", () => {
    expect(classifyAudioFile("tone.wav", "audio/wav", 44).ok).toBe(true);
    const rejected = classifyAudioFile("notes.txt", "text/plain", 20);
    expect(rejected.ok).toBe(false);
  });

  it("does not claim success past the size cap", () => {
    const rejected = classifyAudioFile("big.mp3", "audio/mpeg", 90_000_000);
    expect(rejected.ok).toBe(false);
  });

  it("reads Artist - Title and falls back", () => {
    expect(metadataFromFilename("Ada - Night.mp3")).toEqual({ artist: "Ada", title: "Night" });
    expect(metadataFromFilename("lone.wav").artist).toBe("Unknown artist");
  });

  it("recognizes quota failures", () => {
    expect(isQuotaError({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaError(new Error("nope"))).toBe(false);
  });
});

describe("library behavior", () => {
  it("labels offline and backup independently", () => {
    const flags = availabilityFor({
      inLibrary: true,
      hasLocalAudio: false,
      backup: {
        id: "b",
        profileId: "u",
        trackId: "t",
        provider: "google-drive",
        fileId: "drive-1",
        status: "verified",
        filename: "a.wav",
        mime: "audio/wav",
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
    });
    expect(availabilityLabels(flags)).toEqual(["In library", "Backed up", "Needs download"]);
  });

  it("keeps playlist order and a move", () => {
    expect(orderedItems(items, "p").map((item) => item.trackId)).toEqual(["t1", "t2", "t3"]);
    const moved = moveItem(items, "p", "t3", -1);
    expect(orderedItems(moved, "p").map((item) => item.trackId)).toEqual(["t1", "t3", "t2"]);
    const reloaded = reorderItems(moved, "p", ["t1", "t3", "t2"]);
    expect(orderedItems(reloaded, "p").map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("marks cleared storage as not offline", () => {
    expect(missingLocalTracks([{ id: "t", profileId: "u" } as never], [])).toEqual(["t"]);
  });

  it("does not delete audio when the shell cache version changes", () => {
    expect(shellUpdatePlan().deletesLocalAudio).toBe(false);
  });

  it("hides another profile", () => {
    const rows = [
      { profileId: "a", id: "1" },
      { profileId: "b", id: "2" },
    ];
    expect(visibleTo("a", rows).map((row) => row.id)).toEqual(["1"]);
    expect(assertSameProfile("a", rows[1])).toBe(false);
  });
});

describe("cloud and drive boundaries", () => {
  it("rejects cloud calls when no session secret is configured", () => {
    expect(authorizeCloudRequest("Bearer x", undefined)).toEqual({
      ok: false,
      status: 503,
      error: "not_connected",
    });
  });

  it("rejects a wrong bearer token", () => {
    expect(authorizeCloudRequest("Bearer no", "secret").ok).toBe(false);
  });

  it("ignores duplicate sync ops and keeps the higher playlist version", () => {
    const op: SyncOp = {
      id: "1",
      idempotencyKey: "same",
      profileId: "a",
      kind: "playlist-upsert",
      playlist: { id: "p", profileId: "a", name: "A", version: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
      items: [],
    };
    expect(applyOps([op, { ...op, id: "2" }]).ignoredDuplicates).toBe(1);
    const winner = resolvePlaylistConflict(
      {
        playlist: { id: "p", profileId: "a", name: "local", version: 2, updatedAt: "2026-01-01T00:00:00.000Z" },
        items: [],
      },
      {
        playlist: { id: "p", profileId: "a", name: "remote", version: 1, updatedAt: "2026-06-01T00:00:00.000Z" },
        items: [],
      },
    );
    expect(winner.playlist.name).toBe("local");
  });

  it("does not mark a backup verified without a Drive file id", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ name: "x" }), { status: 200 });
    await expect(
      uploadDriveFile({
        accessToken: "token",
        filename: "a.wav",
        mime: "audio/wav",
        bytes: new Uint8Array([1, 2, 3]),
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow(/file id/);
  });

  it("verifies a Drive file id from a successful response", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ id: "file-9", name: "a.wav", md5Checksum: "abc" }), { status: 200 });
    const result = await uploadDriveFile({
      accessToken: "token",
      filename: "a.wav",
      mime: "audio/wav",
      bytes: new Uint8Array([1, 2, 3]),
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.fileId).toBe("file-9");
    expect(driveConnection({})).toBe("not_connected");
    expect(safeDriveFilename("A/B", "wav")).toBe("AB.wav");
  });

  it("supports a byte range for partial audio responses", () => {
    expect(parseByteRange("bytes=0-1", 10)).toEqual({ start: 0, end: 1 });
    expect(contentRangeHeader(0, 1, 10)).toBe("bytes 0-1/10");
  });

  it("redacts secrets", () => {
    expect(redactLog("access_token=abc bearer secret")).toBe("access_token=[redacted] bearer [redacted]");
  });
});

describe("identity", () => {
  it("hashes bytes and does not invent a catalogue", async () => {
    const hash = await sha256Hex(new TextEncoder().encode("fujara").buffer);
    expect(hash).toHaveLength(64);
    expect(searchMockCatalogue("Taylor Swift")[0].mock).toBe(true);
    expect(searchMockCatalogue("Taylor Swift")[0].title).toContain("Mock");
  });
});
