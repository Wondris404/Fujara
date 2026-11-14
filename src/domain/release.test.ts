import { describe, expect, it } from "vitest";
import { applyVolume, createLoadGate, initialPlayState, notePosition, queueIndexAfterEnd, requestTrack, shouldReloadAudio } from "./player-machine";
import { planImport, writesForImport } from "./import-flow";
import { renameProfile, selectExistingProfile } from "./profiles";
import { applySync, createMemoryCloud, linkTrackToPlaylist, readLibrary } from "@/server/cloud";
import { issueSession, readSession } from "@/server/session";
import { backupMarkFromUpload, deletionOutcome, googleAuthorizeUrl } from "./drive-flow";
import { localLibraryManifest, parseManifest, unavailableAfterManifestImport } from "./manifest";
import { hitsFromArchive, hitsFromMusicBrainz } from "./sources-parse";
import type { CloudTrack } from "./sync-merge";
import type { LibraryEntry } from "./types";

const entry = (patch: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: "t1",
  profileId: "p",
  title: "Edited",
  artist: "Ada",
  durationMs: null,
  mime: "audio/wav",
  contentHash: "abc",
  source: { provider: "local-file" },
  userEdited: true,
  favorite: false,
  deletedAt: null,
  version: 2,
  createdAt: "2026-11-14T00:00:00.000Z",
  updatedAt: "2026-11-14T00:00:00.000Z",
  ...patch,
});

const track = (patch: Partial<CloudTrack> = {}): CloudTrack => ({
  id: "t1",
  ownerId: "user-a",
  title: "Edited",
  artist: "Ada",
  favorite: true,
  contentHash: "abc",
  sourceProvider: "local-file",
  version: 1,
  updatedAt: "2026-11-14T00:00:01.000Z",
  deletedAt: null,
  ...patch,
});

describe("playback isolation", () => {
  it("keeps position and pause when volume or metadata changes", () => {
    const playing = notePosition(requestTrack(initialPlayState(), "t1"), 12.5, false);
    const quieter = applyVolume(playing, 0.2);
    expect(shouldReloadAudio("volume")).toBe(false);
    expect(shouldReloadAudio("metadata")).toBe(false);
    expect(shouldReloadAudio("library")).toBe(false);
    expect(quieter.position).toBe(12.5);
    expect(quieter.paused).toBe(false);
    expect(quieter.trackId).toBe("t1");
    expect(quieter.loadGeneration).toBe(playing.loadGeneration);
  });

  it("drops a stale load after a newer track switch", () => {
    const gate = createLoadGate();
    const first = gate.start();
    const second = gate.start();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    expect(queueIndexAfterEnd(1, 2, "off")).toBe(null);
  });
});

describe("import and profiles", () => {
  it("restores bytes onto the same edited entry and skips an intact copy", () => {
    const existing = entry();
    const restore = planImport({ accepted: true, existing, hasLocalAudio: false });
    expect(restore).toEqual({ action: "restore", entryId: "t1" });
    const writes = writesForImport({
      plan: restore,
      profileId: "p",
      id: "new",
      title: "Filename",
      artist: "Other",
      mime: "audio/wav",
      hash: "abc",
      size: 8,
      now: "2026-11-14T00:00:00.000Z",
    });
    expect(writes.some((write) => write.kind === "put-entry")).toBe(false);
    expect(writes.find((write) => write.kind === "put-audio")).toMatchObject({ id: "t1" });
    const skip = planImport({ accepted: true, existing, hasLocalAudio: true });
    expect(skip).toEqual({ action: "skip", entryId: "t1" });
  });

  it("does not mark a rejected file offline", () => {
    const plan = planImport({ accepted: false, rejectReason: "Unsupported file.", existing: null, hasLocalAudio: false });
    const writes = writesForImport({
      plan,
      profileId: "p",
      id: "x",
      title: "x",
      artist: "x",
      mime: "text/plain",
      hash: "",
      size: 1,
      now: "2026-11-14T00:00:00.000Z",
    });
    expect(writes).toEqual([{ kind: "put-job", state: "failed", error: "Unsupported file." }]);
    expect(writes.some((write) => write.kind === "put-audio")).toBe(false);
  });

  it("returns to an existing local profile after sign-out", () => {
    const profiles = [
      { id: "a", name: "Phone" },
      { id: "b", name: "Desk" },
    ];
    expect(selectExistingProfile(profiles, "b")?.name).toBe("Desk");
    expect(renameProfile(profiles, "b", "Studio")[1].name).toBe("Studio");
  });
});

describe("accounts, sync, drive, discovery", () => {
  it("rejects a shared-secret bearer and a forged session", async () => {
    const secret = "test-secret";
    expect(await readSession(secret, secret)).toBeNull();
    const token = await issueSession("user-a", secret);
    expect(await readSession(token, secret)).toBe("user-a");
    expect(await readSession(token, "other")).toBeNull();
  });

  it("syncs metadata between two clients and keeps audio local", () => {
    const repo = createMemoryCloud();
    applySync(repo, "user-a", { tracks: [track({ title: "Desk edit", version: 2 })] });
    const phone = applySync(repo, "user-a", { tracks: [track({ title: "Old", version: 1 })] });
    expect(phone.tracks[0].title).toBe("Desk edit");
    const offlineEdit = applySync(repo, "user-a", {
      tracks: [track({ title: "Offline", version: 3, deletedAt: null })],
    });
    expect(offlineEdit.tracks[0].title).toBe("Offline");
    applySync(repo, "user-a", { tracks: [track({ version: 4, deletedAt: "2026-11-14T01:00:00.000Z" })] });
    expect(applySync(repo, "user-a", { tracks: [] }).tracks).toEqual([]);
    const viewed = readLibrary(repo, "user-b", ["t1"]);
    expect(viewed.tracks).toEqual([]);
    expect(viewed.offlineIds).toEqual([]);
    const own = readLibrary(repo, "user-a", []);
    expect(own.offlineIds).toEqual([]);
  });

  it("refuses to attach another user's track", () => {
    const repo = createMemoryCloud();
    repo.tracks.push(track());
    repo.playlists.push({
      id: "pl",
      ownerId: "user-b",
      name: "Theirs",
      version: 1,
      updatedAt: "2026-11-14T00:00:00.000Z",
      deletedAt: null,
      trackIds: [],
    });
    expect(linkTrackToPlaylist(repo, "user-b", "pl", "t1").ok).toBe(false);
  });

  it("marks a backup only after a file id and separates four deletions", () => {
    expect(backupMarkFromUpload({})).toBe("absent");
    expect(backupMarkFromUpload({ fileId: "drive-1" })).toBe("verified");
    expect(deletionOutcome("remove-local")).toMatchObject({ keepsLibrary: true, keepsAudio: false, keepsDriveFile: true });
    expect(deletionOutcome("remove-library").keepsLibrary).toBe(false);
    expect(deletionOutcome("delete-drive").keepsDriveFile).toBe(false);
    expect(deletionOutcome("forget-ref")).toMatchObject({ keepsDriveFile: true, keepsBackupRef: false });
    const url = new URL(googleAuthorizeUrl({ clientId: "cid", redirectUri: "http://localhost:3000/api/drive/callback", state: "s", codeChallenge: "c" }));
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
  });

  it("parses the shipped export and does not treat metadata as audio", () => {
    const raw = localLibraryManifest({
      profileId: "profile-1",
      entries: [{
        id: "t1",
        profileId: "profile-1",
        title: "Tone",
        artist: "Fujara",
        durationMs: 1000,
        mime: "audio/wav",
        contentHash: "abc",
        source: null,
        userEdited: false,
        favorite: true,
        deletedAt: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      playlists: [],
      items: [],
      backups: [],
    });
    const manifest = parseManifest(JSON.parse(JSON.stringify(raw)));
    expect(manifest.tracks[0]?.title).toBe("Tone");
    expect(manifest.tracks[0]?.ownerId).toBe("profile-1");
    expect(unavailableAfterManifestImport(manifest, [])).toEqual(["t1"]);
  });

  it("round-trips a manifest without pretending audio is present", () => {
    const manifest = parseManifest({
      version: 1,
      tracks: [track()],
      playlists: [],
      backups: [{ trackId: "t1", fileId: "drive-1", filename: "a.wav", mime: "audio/wav" }],
    });
    expect(unavailableAfterManifestImport(manifest, [])).toEqual(["t1"]);
    expect(unavailableAfterManifestImport(manifest, ["t1"])).toEqual([]);
  });

  it("does not invent downloads for metadata-only results", () => {
    const mb = hitsFromMusicBrainz({ recordings: [{ id: "rec-1", title: "Blank Space", "artist-credit": [{ name: "Taylor Swift" }] }] });
    expect(mb[0].capabilities).toEqual(["metadata-search"]);
    expect(mb[0].audioUrl).toBeUndefined();
    const archive = hitsFromArchive({ response: { docs: [{ identifier: "gov-1922", title: "Speech", creator: "Archive" }] } });
    expect(archive[0].capabilities).toEqual(["metadata-search"]);
    const licensedWithoutFile = hitsFromArchive({
      response: { docs: [{ identifier: "pd-tone", title: "Tone", creator: "Public", licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/" }] },
    });
    expect(licensedWithoutFile[0].audioUrl).toBeUndefined();
    const licensed = hitsFromArchive({
      response: {
        docs: [{
          identifier: "pd-tone",
          title: "Tone",
          creator: "Public",
          licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/",
          files: [{ name: "pd-tone_64kb.mp3" }],
        }],
      },
    });
    expect(licensed[0].audioUrl).toBe("https://archive.org/download/pd-tone/pd-tone_64kb.mp3");
    expect(licensed[0].capabilities).toContain("download");
  });
});
