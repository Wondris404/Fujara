import type { Availability, BackupRef, Job } from "./types";

export function availabilityFor(input: {
  inLibrary: boolean;
  hasLocalAudio: boolean;
  backup?: BackupRef | null;
  job?: Job | null;
}): Availability {
  const backedUp = input.backup?.status === "verified";
  const failed = input.job?.state === "failed";
  const availableOffline = input.hasLocalAudio;
  return {
    inLibrary: input.inLibrary,
    availableOffline,
    backedUp,
    needsDownload: input.inLibrary && !availableOffline && !failed,
    failed: Boolean(failed && !availableOffline),
  };
}

export function availabilityLabels(flags: Availability): string[] {
  const labels: string[] = [];
  if (flags.inLibrary) labels.push("In library");
  if (flags.availableOffline) labels.push("Available offline");
  if (flags.backedUp) labels.push("Backed up");
  if (flags.needsDownload) labels.push("Needs download");
  if (flags.failed) labels.push("Failed");
  return labels;
}
