import type { LibraryEntry } from "./types";

export function missingLocalTracks(entries: LibraryEntry[], localTrackIds: Iterable<string>): string[] {
  const present = new Set(localTrackIds);
  return entries.filter((entry) => !present.has(entry.id)).map((entry) => entry.id);
}

export function shellUpdatePlan(): { nextCache: string; deletesLocalAudio: false } {
  return { nextCache: "fujara-shell-v1", deletesLocalAudio: false };
}
