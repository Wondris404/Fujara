import { readLibraryForUser, upsertPlaylist, writeLibraryForUser, type PlaylistWrite, type TrackWrite } from "@/server/library-store";
import { withUser } from "@/server/postgres";
import { userIdFromRequest } from "@/server/request-user";
import { NextResponse } from "next/server";

function unavailable() {
  return NextResponse.json({ error: "not_connected", message: "Sync needs DATABASE_URL and a signed-in session." }, { status: 503 });
}

export async function GET(request: Request) {
  if (!process.env.FUJARA_SESSION_SECRET || !process.env.DATABASE_URL) return unavailable();
  const userId = await userIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tracks = await readLibraryForUser(userId);
  const playlists = await withUser(userId, async (query) => {
    const lists = await query(`select id, name, version, updated_at, deleted_at from playlists order by updated_at desc`);
    const items = await query(`select playlist_id, track_id, position from playlist_items order by position`);
    return lists.rows.map((row) => ({
      id: String(row.id),
      ownerId: userId,
      name: String(row.name),
      version: Number(row.version),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      deletedAt: row.deleted_at == null ? null : new Date(String(row.deleted_at)).toISOString(),
      trackIds: items.rows.filter((item) => item.playlist_id === row.id).map((item) => String(item.track_id)),
    }));
  });
  return NextResponse.json({ userId, tracks, playlists, audioOnThisDevice: [] });
}

export async function POST(request: Request) {
  if (!process.env.FUJARA_SESSION_SECRET || !process.env.DATABASE_URL) return unavailable();
  const userId = await userIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as { tracks?: TrackWrite[]; playlists?: PlaylistWrite[] };
  const applied: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const track of body.tracks ?? []) {
    const saved = await writeLibraryForUser(userId, track);
    const id = track.opId ?? track.id ?? "track";
    if (saved.status === "saved") applied.push(id);
    else failed.push({ id, error: saved.status });
  }
  for (const playlist of body.playlists ?? []) {
    const saved = await withUser(userId, (query) => upsertPlaylist(query, userId, playlist));
    const id = playlist.opId ?? playlist.id ?? "playlist";
    if (saved.status === "saved") applied.push(id);
    else failed.push({ id, error: saved.status });
  }
  return NextResponse.json({ userId, applied, failed });
}
