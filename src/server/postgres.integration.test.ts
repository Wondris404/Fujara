import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { upsertPlaylist, upsertTrack, listPlaylists, listTracks } from "./library-store";
import { runAsUser, type SqlQuery } from "./postgres";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const trackA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const playlistA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("postgres library isolation", () => {
  let db: { query: SqlQuery; close?: () => Promise<void> } | null = null;
  let live = false;

  it("creates, reorders, rejects foreign tracks, and does not record a stale op", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    db = {
      query: async (text, params) => {
        const result = await pg.query(text, params);
        return { rows: result.rows as Record<string, unknown>[] };
      },
      close: () => pg.close(),
    };
    live = true;
    const root = join(process.cwd(), "db", "migrations");
    for (const file of ["001_library.sql", "002_grants_and_ops.sql", "003_playlist_items_and_ops.sql"]) {
      await pg.exec(readFileSync(join(root, file), "utf8"));
    }
    const query = db.query;
    await runAsUser({ query }, userA, (q) => upsertTrack(q, userA, { id: trackA, title: "Tone", artist: "Fujara", version: 1 }));
    await runAsUser({ query }, userA, (q) => upsertPlaylist(q, userA, { id: playlistA, name: "Night", version: 1, trackIds: [trackA] }));
    await runAsUser({ query }, userA, (q) => upsertPlaylist(q, userA, { id: playlistA, name: "Night", version: 2, trackIds: [trackA], opId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const replay = await runAsUser({ query }, userA, (q) =>
      upsertPlaylist(q, userA, { id: playlistA, name: "Night", version: 2, trackIds: [trackA], opId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
    );
    expect(replay.status).toBe("saved");
    const stale = await runAsUser({ query }, userA, (q) =>
      upsertPlaylist(q, userA, { id: playlistA, name: "Old", version: 1, trackIds: [], opId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }),
    );
    expect(stale.status).toBe("stale");
    const ops = await pg.query(`select id from sync_ops where id = $1`, ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]);
    expect(ops.rows).toHaveLength(0);
    const foreign = await runAsUser({ query }, userB, (q) => upsertPlaylist(q, userB, { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Steal", version: 1, trackIds: [trackA] }));
    expect(foreign.attached).toEqual([]);
    const visible = await runAsUser({ query }, userB, (q) => listTracks(q, userB, true));
    expect(visible).toEqual([]);
    const ownerLists = await runAsUser({ query }, userA, (q) => listPlaylists(q, userA));
    expect(ownerLists[0]?.trackIds).toEqual([trackA]);
    expect(ownerLists[0]?.name).toBe("Night");
  });

  afterAll(async () => {
    if (live) await db?.close?.();
  });
});
