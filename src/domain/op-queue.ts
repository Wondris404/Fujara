export type SyncOp = {
  id: string;
  kind: "track" | "playlist";
  body: Record<string, unknown>;
  attempts: number;
  lastError?: string;
};

export function enqueueOp(queue: SyncOp[], op: SyncOp): SyncOp[] {
  if (queue.some((item) => item.id === op.id)) return queue;
  return [...queue, op];
}

export function settleOps(queue: SyncOp[], appliedIds: string[], failed: { id: string; error: string }[]): SyncOp[] {
  const applied = new Set(appliedIds);
  const errors = new Map(failed.map((item) => [item.id, item.error]));
  return queue
    .filter((op) => !applied.has(op.id))
    .map((op) => (errors.has(op.id) ? { ...op, attempts: op.attempts + 1, lastError: errors.get(op.id) } : op));
}
