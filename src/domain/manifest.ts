import type { BackupRef, LibraryEntry, Playlist, PlaylistItem } from "./types";
import type { CloudPlaylist, CloudTrack } from "./sync-merge";

export type RecoveryManifest = {
  version: 1;
  tracks: CloudTrack[];
  playlists: CloudPlaylist[];
  backups: { trackId: string; fileId: string; checksum?: string; filename: string; mime: string }[];
};

export function parseManifest(input: unknown): RecoveryManifest {
  if (!input || typeof input !== "object") throw new Error("Manifest must be a JSON object.");
  const body = input as Partial<RecoveryManifest>;
  if (body.version !== 1 || !Array.isArray(body.tracks) || !Array.isArray(body.playlists)) {
    throw new Error("Unsupported manifest.");
  }
  return {
    version: 1,
    tracks: body.tracks,
    playlists: body.playlists,
    backups: Array.isArray(body.backups) ? body.backups : [],
  };
}

/** Same object the settings export writes. ownerId is the local profile, never a value copied from foreign JSON. */
export function localLibraryManifest(input: {
  profileId: string;
  entries: LibraryEntry[];
  playlists: Playlist[];
  items: PlaylistItem[];
  backups: BackupRef[];
}): RecoveryManifest {
  const tracks: CloudTrack[] = input.entries.map((entry) => ({
    id: entry.id,
    ownerId: input.profileId,
    title: entry.title,
    artist: entry.artist,
    favorite: entry.favorite,
    contentHash: entry.contentHash,
    sourceProvider: entry.source?.provider ?? null,
    sourcePageUrl: entry.source?.pageUrl ?? null,
    version: entry.version,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
  }));
  const playlists: CloudPlaylist[] = input.playlists.map((playlist) => ({
    id: playlist.id,
    ownerId: input.profileId,
    name: playlist.name,
    version: playlist.version,
    updatedAt: playlist.updatedAt,
    deletedAt: null,
    trackIds: input.items
      .filter((item) => item.playlistId === playlist.id)
      .sort((a, b) => a.position - b.position)
      .map((item) => item.trackId),
  }));
  return {
    version: 1,
    tracks,
    playlists,
    backups: input.backups.map((backup) => ({
      trackId: backup.trackId,
      fileId: backup.fileId,
      checksum: backup.checksum,
      filename: backup.filename,
      mime: backup.mime,
    })),
  };
}

export function adoptManifest(manifest: RecoveryManifest, ownerId: string): RecoveryManifest {
  return {
    version: 1,
    tracks: manifest.tracks.map((track) => ({ ...track, ownerId })),
    playlists: manifest.playlists.map((playlist) => ({ ...playlist, ownerId })),
    backups: manifest.backups,
  };
}

export function unavailableAfterManifestImport(manifest: RecoveryManifest, localAudioIds: string[]): string[] {
  const have = new Set(localAudioIds);
  return manifest.tracks.filter((track) => track.deletedAt === null && !have.has(track.id)).map((track) => track.id);
}
