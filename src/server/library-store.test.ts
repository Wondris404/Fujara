import { describe, expect, it } from "vitest";
import { listTracks, upsertTrack } from "./library-store";
import { runAsUser, type SqlQuery } from "./postgres";

function memoryDb() {
  const calls: string[] = [];
  const tracks = new Map<string, Record<string, unknown>>();
  let user = "";
  const query: SqlQuery = async (text, params = []) => {
    calls.push(text);
    if (text.startsWith("begin") || text.startsWith("commit") || text.startsWith("rollback")) return { rows: [] };
    if (text.includes("set_config")) {
      user = String(params[0]);
      return { rows: [] };
    }
    if (text.includes("insert into profiles") || text.includes("insert into sync_ops")) return { rows: [{ id: params[0] }] };
    if (text.includes("insert into tracks")) {
      const owner = String(params[1]);
      if (owner !== user) return { rows: [] };
      const existing = tracks.get(String(params[0]));
      if (existing && existing.owner_id !== owner) return { rows: [] };
      if (existing && Number(existing.version) > Number(params[9])) return { rows: [] };
      const row = {
        id: params[0],
        owner_id: owner,
        title: params[2],
        artist: params[3],
        content_hash: params[5],
        source_provider: params[6],
        favorite: params[8],
        version: params[9],
        deleted_at: params[10],
        updated_at: "2026-01-02T00:00:00.000Z",
      };
      tracks.set(String(params[0]), row);
      return { rows: [row] };
    }
    if (text.startsWith("select")) {
      return { rows: [...tracks.values()].filter((row) => row.owner_id === user && row.deleted_at == null) };
    }
    return { rows: [] };
  };
  return { query, calls, tracks };
}

describe("postgres library adapter", () => {
  it("sets the user on the same client and hides another user's track", async () => {
    const db = memoryDb();
    await runAsUser({ query: db.query }, "11111111-1111-4111-8111-111111111111", (query) =>
      upsertTrack(query, "11111111-1111-4111-8111-111111111111", { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "A", artist: "One", version: 1 }),
    );
    await runAsUser({ query: db.query }, "22222222-2222-4222-8222-222222222222", async (query) => {
      const stolen = await upsertTrack(query, "22222222-2222-4222-8222-222222222222", {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Stolen",
        artist: "Two",
        version: 2,
      });
      expect(stolen.status === "saved" ? stolen.track?.title : stolen.status).not.toBe("Stolen");
      const visible = await listTracks(query, "22222222-2222-4222-8222-222222222222");
      expect(visible.map((track) => track.title)).not.toContain("A");
    });
    expect(db.calls.some((sql) => sql.includes("set_config"))).toBe(true);
    const first = await runAsUser({ query: db.query }, "11111111-1111-4111-8111-111111111111", (query) =>
      listTracks(query, "11111111-1111-4111-8111-111111111111"),
    );
    expect(first.map((track) => track.title)).toEqual(["A"]);
  });
});
