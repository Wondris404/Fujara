export type SourceRef = {
  provider: string;
  pageUrl?: string;
  providerTrackId?: string;
};

export type LibraryEntry = {
  id: string;
  profileId: string;
  title: string;
  artist: string;
  durationMs: number | null;
  mime: string;
  contentHash: string | null;
  source: SourceRef | null;
  userEdited: boolean;
  favorite: boolean;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalAudioMeta = {
  id: string;
  profileId: string;
  trackId: string;
  size: number;
  sha256: string;
  mime: string;
};

export type Playlist = {
  id: string;
  profileId: string;
  name: string;
  version: number;
  updatedAt: string;
};

export type PlaylistItem = {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
};

export type BackupStatus = "pending" | "verified" | "missing" | "error";

export type BackupRef = {
  id: string;
  profileId: string;
  trackId: string;
  provider: "google-drive";
  fileId: string;
  status: BackupStatus;
  checksum?: string;
  filename: string;
  mime: string;
  updatedAt: string;
};

export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Job = {
  id: string;
  profileId: string;
  trackId?: string;
  kind: "import" | "backup" | "restore";
  state: JobState;
  error?: string;
  idempotencyKey: string;
  updatedAt: string;
};

export type Availability = {
  inLibrary: boolean;
  availableOffline: boolean;
  backedUp: boolean;
  needsDownload: boolean;
  failed: boolean;
};

export const ACCEPTED_EXTENSIONS = ["mp3", "wav", "m4a", "mp4", "ogg", "webm", "flac", "aac"] as const;

export const MAX_IMPORT_BYTES = 80_000_000;

export const SHELL_CACHE = "fujara-shell-v1";
