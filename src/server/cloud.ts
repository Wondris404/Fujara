import { canAttach, mergeTracks, projectDevice, visibleTracks, type CloudPlaylist, type CloudTrack } from "@/domain/sync-merge";

export type CloudRepo = {
  tracks: CloudTrack[];
  playlists: CloudPlaylist[];
};

export function createMemoryCloud(): CloudRepo {
  return { tracks: [], playlists: [] };
}

export type SyncBody = {
  tracks?: CloudTrack[];
  playlists?: CloudPlaylist[];
};

export function applySync(repo: CloudRepo, actorId: string, body: SyncBody): { tracks: CloudTrack[]; playlists: CloudPlaylist[] } {
  const incomingTracks = (body.tracks ?? []).filter((track) => track.ownerId === actorId);
  const incomingLists = (body.playlists ?? []).filter((list) => list.ownerId === actorId);
  repo.tracks = mergeTracks(
    incomingTracks,
    repo.tracks.filter((track) => track.ownerId === actorId),
  ).concat(repo.tracks.filter((track) => track.ownerId !== actorId));
  const mine = new Map(repo.playlists.filter((list) => list.ownerId === actorId).map((list) => [list.id, list]));
  for (const list of incomingLists) {
    const current = mine.get(list.id);
    if (!current || list.version > current.version) mine.set(list.id, list);
  }
  repo.playlists = [...repo.playlists.filter((list) => list.ownerId !== actorId), ...mine.values()];
  return {
    tracks: visibleTracks(actorId, repo.tracks),
    playlists: repo.playlists.filter((list) => list.ownerId === actorId && list.deletedAt === null),
  };
}

export function readLibrary(repo: CloudRepo, actorId: string, localAudioIds: string[]) {
  return projectDevice(actorId, repo.tracks, localAudioIds);
}

export function linkTrackToPlaylist(repo: CloudRepo, actorId: string, playlistId: string, trackId: string): { ok: true } | { ok: false; error: string } {
  const playlist = repo.playlists.find((list) => list.id === playlistId);
  const track = repo.tracks.find((row) => row.id === trackId);
  if (!playlist || !track || !canAttach(actorId, playlist, track)) return { ok: false, error: "forbidden" };
  return { ok: true };
}
