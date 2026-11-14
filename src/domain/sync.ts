import type { Playlist, PlaylistItem } from "./types";

export type SyncOp = {
  id: string;
  idempotencyKey: string;
  profileId: string;
  kind: "playlist-upsert";
  playlist: Playlist;
  items: PlaylistItem[];
};

/**
 * Conflict policy: playlists use a version counter.
 * The higher version wins. Equal versions keep the later updatedAt.
 * Item order of the winner is kept. This is last-writer-wins, not collaborative merge.
 * Duplicate idempotency keys are ignored.
 */
export function applyOps(ops: SyncOp[]): { applied: SyncOp[]; ignoredDuplicates: number } {
  const seen = new Set<string>();
  const applied: SyncOp[] = [];
  let ignoredDuplicates = 0;
  for (const op of ops) {
    if (seen.has(op.idempotencyKey)) {
      ignoredDuplicates += 1;
      continue;
    }
    seen.add(op.idempotencyKey);
    applied.push(op);
  }
  return { applied, ignoredDuplicates };
}

export function resolvePlaylistConflict(
  local: { playlist: Playlist; items: PlaylistItem[] },
  remote: { playlist: Playlist; items: PlaylistItem[] },
): { playlist: Playlist; items: PlaylistItem[] } {
  if (remote.playlist.version > local.playlist.version) return remote;
  if (local.playlist.version > remote.playlist.version) return local;
  return remote.playlist.updatedAt > local.playlist.updatedAt ? remote : local;
}
