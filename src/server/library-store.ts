import type { CloudPlaylist, CloudTrack } from "@/domain/sync-merge";
import { payloadHash, playlistItemId } from "@/server/ids";
import { runAsUser, withUser, type SqlQuery } from "@/server/postgres";

export type TrackWrite = {
  id?: string;
  title?: string;
  artist?: string;
  favorite?: boolean;
  version?: number;
  contentHash?: string | null;
  sourceProvider?: string | null;
  sourcePageUrl?: string | null;
  mime?: string | null;
  deletedAt?: string | null;
  opId?: string;
};

export type BackupWrite = {
  id?: string;
  trackId?: string;
  fileId?: string;
  checksum?: string | null;
  filename?: string;
  mime?: string;
  status?: string;
  opId?: string;
};

function rowToTrack(row: Record<string, unknown>): CloudTrack {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    title: String(row.title),
    artist: String(row.artist),
    favorite: Boolean(row.favorite),
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    sourceProvider: row.source_provider == null ? null : String(row.source_provider),
    version: Number(row.version),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    deletedAt: row.deleted_at == null ? null : new Date(String(row.deleted_at)).toISOString(),
  };
}

const TRACK_COLUMNS = `id, owner_id, title, artist, favorite, content_hash, source_provider, version, updated_at, deleted_at`;

async function claimOp(query: SqlQuery, ownerId: string, opId: string | undefined, hash: string): Promise<"new" | "replay" | "conflict"> {
  if (!opId) return "new";
  const existing = await query(`select payload_hash from sync_ops where id = $1 and owner_id = $2`, [opId, ownerId]);
  if (!existing.rows[0]) return "new";
  return existing.rows[0].payload_hash === hash ? "replay" : "conflict";
}

async function finishOp(query: SqlQuery, ownerId: string, opId: string | undefined, kind: string, hash: string): Promise<void> {
  if (!opId) return;
  await query(
    `insert into sync_ops (id, owner_id, kind, payload_hash) values ($1, $2, $3, $4)
     on conflict (id) do update set payload_hash = excluded.payload_hash where sync_ops.owner_id = excluded.owner_id`,
    [opId, ownerId, kind, hash],
  );
}

export async function listTracks(query: SqlQuery, ownerId: string, includeDeleted = false): Promise<CloudTrack[]> {
  const result = await query(
    `select ${TRACK_COLUMNS} from tracks where owner_id = $1 ${includeDeleted ? "" : "and deleted_at is null"} order by updated_at desc`,
    [ownerId],
  );
  return result.rows.map((row) => rowToTrack(row));
}

export async function upsertTrack(query: SqlQuery, ownerId: string, body: TrackWrite): Promise<{ status: "saved" | "stale" | "invalid" | "conflict"; track?: CloudTrack }> {
  if (!body.id || !body.title || !body.artist) return { status: "invalid" };
  const hash = payloadHash({ ...body, ownerId });
  const claim = await claimOp(query, ownerId, body.opId, hash);
  if (claim === "conflict") return { status: "conflict" };
  if (claim === "replay") {
    const current = await query(`select ${TRACK_COLUMNS} from tracks where id = $1 and owner_id = $2`, [body.id, ownerId]);
    return { status: "saved", track: current.rows[0] ? rowToTrack(current.rows[0]) : undefined };
  }
  await query(`insert into profiles (id, display_name) values ($1, 'Fujara') on conflict (id) do nothing`, [ownerId]);
  const result = await query(
    `insert into tracks (id, owner_id, title, artist, mime, content_hash, source_provider, source_page_url, favorite, version, deleted_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     on conflict (id) do update set
       title = excluded.title,
       artist = excluded.artist,
       mime = excluded.mime,
       content_hash = excluded.content_hash,
       source_provider = excluded.source_provider,
       source_page_url = excluded.source_page_url,
       favorite = excluded.favorite,
       version = excluded.version,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     where tracks.owner_id = $2 and tracks.version <= excluded.version
     returning ${TRACK_COLUMNS}`,
    [body.id, ownerId, body.title, body.artist, body.mime ?? "audio/mpeg", body.contentHash ?? null, body.sourceProvider ?? null, body.sourcePageUrl ?? null, Boolean(body.favorite), body.version ?? 1, body.deletedAt ?? null],
  );
  if (!result.rows[0]) return { status: "stale" };
  await finishOp(query, ownerId, body.opId, "track", hash);
  return { status: "saved", track: rowToTrack(result.rows[0]) };
}

export async function readLibraryForUser(userId: string): Promise<CloudTrack[]> {
  return withUser(userId, (query) => listTracks(query, userId, true));
}

export async function writeLibraryForUser(userId: string, body: TrackWrite) {
  return withUser(userId, (query) => upsertTrack(query, userId, body));
}

export async function saveDriveGrant(userId: string, refreshToken: string): Promise<void> {
  await withUser(userId, async (query) => {
    await query(`insert into profiles (id, display_name) values ($1, 'Fujara') on conflict (id) do nothing`, [userId]);
    await query(
      `insert into drive_grants (owner_id, refresh_token, updated_at) values ($1, $2, now())
       on conflict (owner_id) do update set refresh_token = excluded.refresh_token, updated_at = now()`,
      [userId, refreshToken],
    );
  });
}

export async function readDriveGrant(userId: string): Promise<string | null> {
  return withUser(userId, async (query) => {
    const result = await query(`select refresh_token from drive_grants where owner_id = $1`, [userId]);
    const token = result.rows[0]?.refresh_token;
    return typeof token === "string" ? token : null;
  });
}

export type PlaylistWrite = {
  id?: string;
  name?: string;
  version?: number;
  deletedAt?: string | null;
  trackIds?: string[];
  opId?: string;
};

export async function listPlaylists(query: SqlQuery, ownerId: string): Promise<CloudPlaylist[]> {
  const lists = await query(
    `select id, owner_id, name, version, updated_at, deleted_at from playlists where owner_id = $1 order by updated_at desc`,
    [ownerId],
  );
  const items = await query(
    `select playlist_items.playlist_id, playlist_items.track_id, playlist_items.position
     from playlist_items
     join playlists on playlists.id = playlist_items.playlist_id and playlists.owner_id = $1
     join tracks on tracks.id = playlist_items.track_id and tracks.owner_id = $1
     order by playlist_items.position`,
    [ownerId],
  );
  return lists.rows.map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    version: Number(row.version),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    deletedAt: row.deleted_at == null ? null : new Date(String(row.deleted_at)).toISOString(),
    trackIds: items.rows.filter((item) => item.playlist_id === row.id).map((item) => String(item.track_id)),
  }));
}

export async function listBackups(query: SqlQuery, ownerId: string) {
  const result = await query(
    `select id, owner_id, track_id, file_id, checksum, filename, mime, status from backup_refs where owner_id = $1`,
    [ownerId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    trackId: String(row.track_id),
    fileId: String(row.file_id),
    checksum: row.checksum == null ? undefined : String(row.checksum),
    filename: String(row.filename),
    mime: String(row.mime),
    status: String(row.status),
  }));
}

export async function upsertPlaylist(query: SqlQuery, ownerId: string, body: PlaylistWrite): Promise<{ status: "saved" | "stale" | "invalid" | "conflict"; attached: string[] }> {
  if (!body.id || !body.name) return { status: "invalid", attached: [] };
  const hash = payloadHash({ ...body, ownerId });
  const claim = await claimOp(query, ownerId, body.opId, hash);
  if (claim === "conflict") return { status: "conflict", attached: [] };
  if (claim === "replay") {
    const current = await listPlaylists(query, ownerId);
    return { status: "saved", attached: current.find((list) => list.id === body.id)?.trackIds ?? [] };
  }
  await query(`insert into profiles (id, display_name) values ($1, 'Fujara') on conflict (id) do nothing`, [ownerId]);
  const saved = await query(
    `insert into playlists (id, owner_id, name, version, deleted_at, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (id) do update set name = excluded.name, version = excluded.version, deleted_at = excluded.deleted_at, updated_at = now()
     where playlists.owner_id = $2 and playlists.version <= excluded.version
     returning id`,
    [body.id, ownerId, body.name, body.version ?? 1, body.deletedAt ?? null],
  );
  if (!saved.rows[0]) return { status: "stale", attached: [] };
  const trackIds = body.trackIds ?? [];
  await query(
    `delete from playlist_items using playlists
     where playlist_items.playlist_id = playlists.id
       and playlists.id = $1 and playlists.owner_id = $2
       and not (playlist_items.track_id = any($3::uuid[]))`,
    [body.id, ownerId, trackIds],
  );
  const attached: string[] = [];
  for (let index = 0; index < trackIds.length; index += 1) {
    const trackId = trackIds[index];
    const link = await query(
      `insert into playlist_items (id, playlist_id, track_id, position)
       select $1::uuid, $2::uuid, tracks.id, $3 from tracks
       where tracks.id = $4::uuid and tracks.owner_id = $5::uuid and tracks.deleted_at is null
       on conflict (playlist_id, track_id) do update set position = excluded.position
       returning track_id`,
      [playlistItemId(body.id, trackId), body.id, index, trackId, ownerId],
    );
    if (link.rows[0]) attached.push(String(link.rows[0].track_id));
  }
  await finishOp(query, ownerId, body.opId, "playlist", hash);
  return { status: "saved", attached };
}

export async function upsertBackup(query: SqlQuery, ownerId: string, body: BackupWrite): Promise<{ status: "saved" | "invalid" | "conflict" | "rejected" }> {
  if (!body.trackId || !body.fileId || !body.filename || !body.mime) return { status: "invalid" };
  const hash = payloadHash({ ...body, ownerId });
  const claim = await claimOp(query, ownerId, body.opId, hash);
  if (claim === "conflict") return { status: "conflict" };
  if (claim === "replay") return { status: "saved" };
  const owned = await query(`select id from tracks where id = $1 and owner_id = $2`, [body.trackId, ownerId]);
  if (!owned.rows[0]) return { status: "rejected" };
  await query(
    `insert into backup_refs (id, owner_id, track_id, provider, file_id, status, checksum, filename, mime, updated_at)
     values ($1, $2, $3, 'google-drive', $4, $5, $6, $7, $8, now())
     on conflict (id) do update set file_id = excluded.file_id, status = excluded.status, checksum = excluded.checksum, filename = excluded.filename, mime = excluded.mime, updated_at = now()
     where backup_refs.owner_id = $2`,
    [body.id ?? playlistItemId(ownerId, body.trackId), ownerId, body.trackId, body.fileId, body.status ?? "verified", body.checksum ?? null, body.filename, body.mime],
  );
  await finishOp(query, ownerId, body.opId, "backup", hash);
  return { status: "saved" };
}

export async function clearDriveGrant(userId: string): Promise<void> {
  await withUser(userId, async (query) => {
    await query(`delete from drive_grants where owner_id = $1`, [userId]);
  });
}

export { runAsUser };
