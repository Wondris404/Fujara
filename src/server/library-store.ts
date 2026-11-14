import type { CloudTrack } from "@/domain/sync-merge";
import { runAsUser, withUser, type SqlQuery } from "@/server/postgres";

export type TrackWrite = {
  id?: string;
  title?: string;
  artist?: string;
  favorite?: boolean;
  version?: number;
  contentHash?: string | null;
  sourceProvider?: string | null;
  deletedAt?: string | null;
  opId?: string;
};

function rowToTrack(row: Record<string, unknown>, ownerId: string): CloudTrack {
  return {
    id: String(row.id),
    ownerId,
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

export async function listTracks(query: SqlQuery, ownerId: string): Promise<CloudTrack[]> {
  const result = await query(
    `select id, title, artist, favorite, content_hash, source_provider, version, updated_at, deleted_at
     from tracks where deleted_at is null order by updated_at desc`,
  );
  return result.rows.map((row) => rowToTrack(row, ownerId));
}

export async function upsertTrack(query: SqlQuery, ownerId: string, body: TrackWrite): Promise<{ status: "saved" | "stale" | "invalid"; track?: CloudTrack }> {
  if (!body.id || !body.title || !body.artist) return { status: "invalid" };
  if (body.opId) {
    const seen = await query(
      `insert into sync_ops (id, owner_id, kind) values ($1, $2, 'track') on conflict (id) do nothing returning id`,
      [body.opId, ownerId],
    );
    if (seen.rows.length === 0) {
      const current = await query(`select id, title, artist, favorite, content_hash, source_provider, version, updated_at, deleted_at from tracks where id = $1`, [body.id]);
      return { status: "saved", track: current.rows[0] ? rowToTrack(current.rows[0], ownerId) : undefined };
    }
  }
  await query(`insert into profiles (id, display_name) values ($1, 'Fujara') on conflict (id) do nothing`, [ownerId]);
  const result = await query(
    `insert into tracks (id, owner_id, title, artist, mime, content_hash, source_provider, favorite, version, deleted_at, updated_at)
     values ($1, $2, $3, $4, 'audio/mpeg', $5, $6, $7, $8, $9, now())
     on conflict (id) do update set
       title = excluded.title,
       artist = excluded.artist,
       content_hash = excluded.content_hash,
       source_provider = excluded.source_provider,
       favorite = excluded.favorite,
       version = excluded.version,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     where tracks.owner_id = $2 and tracks.version <= excluded.version
     returning id, title, artist, favorite, content_hash, source_provider, version, updated_at, deleted_at`,
    [body.id, ownerId, body.title, body.artist, body.contentHash ?? null, body.sourceProvider ?? null, Boolean(body.favorite), body.version ?? 1, body.deletedAt ?? null],
  );
  if (!result.rows[0]) return { status: "stale" };
  return { status: "saved", track: rowToTrack(result.rows[0], ownerId) };
}

export async function readLibraryForUser(userId: string): Promise<CloudTrack[]> {
  return withUser(userId, (query) => listTracks(query, userId));
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

export async function clearDriveGrant(userId: string): Promise<void> {
  await withUser(userId, async (query) => {
    await query(`delete from drive_grants where owner_id = $1`, [userId]);
  });
}

export { runAsUser };
