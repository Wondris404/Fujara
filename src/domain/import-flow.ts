import type { LibraryEntry } from "./types";

export type ImportPlan =
  | { action: "reject"; reason: string }
  | { action: "skip"; entryId: string }
  | { action: "restore"; entryId: string }
  | { action: "create" };

export function planImport(input: {
  accepted: boolean;
  rejectReason?: string;
  existing: Pick<LibraryEntry, "id" | "userEdited"> | null;
  hasLocalAudio: boolean;
}): ImportPlan {
  if (!input.accepted) return { action: "reject", reason: input.rejectReason ?? "Unsupported file." };
  if (!input.existing) return { action: "create" };
  if (!input.hasLocalAudio) return { action: "restore", entryId: input.existing.id };
  return { action: "skip", entryId: input.existing.id };
}

export type Write =
  | { kind: "put-audio"; id: string; profileId: string; size: number; sha256: string; mime: string }
  | { kind: "put-entry"; entry: LibraryEntry }
  | { kind: "put-job"; state: "succeeded" | "failed"; error?: string; trackId?: string };

export function writesForImport(input: {
  plan: ImportPlan;
  profileId: string;
  id: string;
  title: string;
  artist: string;
  mime: string;
  hash: string;
  size: number;
  now: string;
}): Write[] {
  if (input.plan.action === "reject") {
    return [{ kind: "put-job", state: "failed", error: input.plan.reason }];
  }
  if (input.plan.action === "skip") {
    return [{ kind: "put-job", state: "succeeded", trackId: input.plan.entryId, error: "Already stored. Edited metadata was kept." }];
  }
  const trackId = input.plan.action === "restore" ? input.plan.entryId : input.id;
  const audio: Write = {
    kind: "put-audio",
    id: trackId,
    profileId: input.profileId,
    size: input.size,
    sha256: input.hash,
    mime: input.mime,
  };
  const job: Write = { kind: "put-job", state: "succeeded", trackId };
  if (input.plan.action === "restore") return [audio, job];
  const entry: LibraryEntry = {
    id: input.id,
    profileId: input.profileId,
    title: input.title,
    artist: input.artist,
    durationMs: null,
    mime: input.mime,
    contentHash: input.hash,
    source: { provider: "local-file" },
    userEdited: false,
    favorite: false,
    deletedAt: null,
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return [audio, { kind: "put-entry", entry }, job];
}
