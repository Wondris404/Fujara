import { listBackups, listPlaylists, listTracks, upsertBackup, upsertPlaylist, writeLibraryForUser, type BackupWrite, type PlaylistWrite, type TrackWrite } from "@/server/library-store";
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
  const [tracks, playlists, backups] = await withUser(userId, (query) =>
    Promise.all([listTracks(query, userId, true), listPlaylists(query, userId), listBackups(query, userId)]),
  );
  return NextResponse.json({ userId, tracks, playlists, backups, audioOnThisDevice: [] });
}

export async function POST(request: Request) {
  if (!process.env.FUJARA_SESSION_SECRET || !process.env.DATABASE_URL) return unavailable();
  const userId = await userIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as { tracks?: TrackWrite[]; playlists?: PlaylistWrite[]; backups?: BackupWrite[] };
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
  for (const backup of body.backups ?? []) {
    const saved = await withUser(userId, (query) => upsertBackup(query, userId, backup));
    const id = backup.opId ?? backup.id ?? backup.trackId ?? "backup";
    if (saved.status === "saved") applied.push(id);
    else failed.push({ id, error: saved.status });
  }
  return NextResponse.json({ userId, applied, failed });
}
