import { describe, expect, it } from "vitest";
import { deleteDriveFile, downloadDriveBytes, ensureFujaraFolder, uploadResumable } from "./drive-transfer";
import { fetchArchiveAudio } from "./archive-fetch";
import { enqueueOp, settleOps } from "./op-queue";

describe("drive transfer", () => {
  it("reuses a folder, uploads through a resumable session, and returns a file id", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/files?q=")) return new Response(JSON.stringify({ files: [] }), { status: 200 });
      if (url.endsWith("/files?fields=id") && init?.method === "POST") return new Response(JSON.stringify({ id: "folder-1" }), { status: 200 });
      if (url.includes("uploadType=resumable")) {
        return new Response(null, { status: 200, headers: { location: "https://upload.example/session" } });
      }
      if (url === "https://upload.example/session") {
        expect(init?.headers).toMatchObject({ "Content-Range": "bytes 0-3/4" });
        return new Response(JSON.stringify({ id: "file-9", name: "a.wav", md5Checksum: "abc" }), { status: 200 });
      }
      return new Response("no", { status: 500 });
    }) as typeof fetch;
    const folder = await ensureFujaraFolder("token", fetchImpl);
    const uploaded = await uploadResumable({
      accessToken: "token",
      filename: "a.wav",
      mime: "audio/wav",
      bytes: new Uint8Array([1, 2, 3, 4]),
      parentId: folder,
      fetchImpl,
    });
    expect(uploaded.fileId).toBe("file-9");
    expect(calls.some((line) => line.startsWith("PUT https://upload.example/session"))).toBe(true);
  });

  it("reports a missing Drive file and deletes by id", async () => {
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    await expect(downloadDriveBytes("token", "file-1", fetchImpl)).rejects.toThrow(/missing/);
    await deleteDriveFile("token", "file-1", fetchImpl);
  });
});

describe("archive fetch", () => {
  it("rejects other hosts and redirects", async () => {
    await expect(fetchArchiveAudio("https://evil.example/a.mp3", fetch)).rejects.toThrow(/archive.org/);
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/a.mp3" } })) as typeof fetch;
    await expect(fetchArchiveAudio("https://archive.org/download/item/a.mp3", fetchImpl)).rejects.toThrow(/redirect/i);
  });

  it("returns audio bytes from archive.org", async () => {
    const fetchImpl = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } })) as typeof fetch;
    const saved = await fetchArchiveAudio("https://archive.org/download/item/a.mp3", fetchImpl);
    expect(saved.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(saved.mime).toBe("audio/mpeg");
  });
});

describe("offline op queue", () => {
  it("keeps failed ops and drops applied ids", () => {
    const queued = enqueueOp([], { id: "op-1", kind: "track", body: { title: "A" }, attempts: 0 });
    const again = enqueueOp(queued, { id: "op-1", kind: "track", body: { title: "B" }, attempts: 0 });
    expect(again).toHaveLength(1);
    const left = settleOps(
      [...again, { id: "op-2", kind: "track", body: {}, attempts: 0 }],
      ["op-1"],
      [{ id: "op-2", error: "stale_version" }],
    );
    expect(left).toEqual([{ id: "op-2", kind: "track", body: {}, attempts: 1, lastError: "stale_version" }]);
  });
});
