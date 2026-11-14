export type CloudTrack = {
  id: string;
  ownerId: string;
  title: string;
  artist: string;
  favorite: boolean;
  contentHash: string | null;
  sourceProvider: string | null;
  sourcePageUrl?: string | null;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
};

export type CloudPlaylist = {
  id: string;
  ownerId: string;
  name: string;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
  trackIds: string[];
};

export type DeviceView = {
  tracks: CloudTrack[];
  offlineIds: string[];
};

export function visibleTracks(actorId: string, tracks: CloudTrack[]): CloudTrack[] {
  return tracks.filter((track) => track.ownerId === actorId && track.deletedAt === null);
}

export function canAttach(actorId: string, playlist: CloudPlaylist, track: CloudTrack): boolean {
  return playlist.ownerId === actorId && track.ownerId === actorId && track.deletedAt === null && playlist.deletedAt === null;
}

/**
 * Higher version wins. Equal versions use the later server-assigned updatedAt.
 * A newer tombstone stays deleted. Device offline ids are never copied.
 */
export function mergeTracks(local: CloudTrack[], remote: CloudTrack[]): CloudTrack[] {
  const byId = new Map<string, CloudTrack>();
  for (const track of [...remote, ...local]) {
    const current = byId.get(track.id);
    if (!current) {
      byId.set(track.id, track);
      continue;
    }
    if (track.version > current.version || (track.version === current.version && track.updatedAt > current.updatedAt)) {
      byId.set(track.id, track);
    }
  }
  return [...byId.values()];
}

export function projectDevice(actorId: string, tracks: CloudTrack[], localAudioIds: string[]): DeviceView {
  const mine = visibleTracks(actorId, tracks);
  const offline = new Set(localAudioIds);
  return { tracks: mine, offlineIds: mine.filter((track) => offline.has(track.id)).map((track) => track.id) };
}
