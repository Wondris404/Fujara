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

export function unavailableAfterManifestImport(manifest: RecoveryManifest, localAudioIds: string[]): string[] {
  const have = new Set(localAudioIds);
  return manifest.tracks.filter((track) => track.deletedAt === null && !have.has(track.id)).map((track) => track.id);
}
