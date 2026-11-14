export type SyncOp = {
  id: string;
  kind: "track" | "playlist" | "backup";
  body: Record<string, unknown>;
  attempts: number;
  lastError?: string;
};

export function enqueueOp(queue: SyncOp[], op: SyncOp): SyncOp[] {
  if (queue.some((item) => item.id === op.id)) return queue;
  return [...queue, op];
}

/** Drop only ops that were applied and were not edited again while the request was in flight. */
export function settleSnapshot(latest: SyncOp[], sent: SyncOp[], appliedIds: string[], failed: { id: string; error: string }[]): SyncOp[] {
  const sentById = new Map(sent.map((op) => [op.id, JSON.stringify(op.body)]));
  const applied = new Set(appliedIds);
  const errors = new Map(failed.map((item) => [item.id, item.error]));
  return latest.flatMap((op) => {
    const same = sentById.get(op.id) === JSON.stringify(op.body);
    if (same && applied.has(op.id)) return [];
    if (same && errors.has(op.id)) return [{ ...op, attempts: op.attempts + 1, lastError: errors.get(op.id) }];
    return [op];
  });
}

export function settleOps(queue: SyncOp[], appliedIds: string[], failed: { id: string; error: string }[]): SyncOp[] {
  const applied = new Set(appliedIds);
  const errors = new Map(failed.map((item) => [item.id, item.error]));
  return queue
    .filter((op) => !applied.has(op.id))
    .map((op) => (errors.has(op.id) ? { ...op, attempts: op.attempts + 1, lastError: errors.get(op.id) } : op));
}
