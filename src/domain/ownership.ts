export type Owned = { profileId: string };

export function assertSameProfile(actorProfileId: string, row: Owned): boolean {
  return Boolean(actorProfileId) && actorProfileId === row.profileId;
}

export function visibleTo<T extends Owned>(actorProfileId: string, rows: T[]): T[] {
  return rows.filter((row) => row.profileId === actorProfileId);
}

export type CloudDecision =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: "unauthorized" | "not_connected" };

export function authorizeCloudRequest(
  authorizationHeader: string | null,
  sessionSecret: string | undefined,
): CloudDecision {
  if (!sessionSecret) return { ok: false, status: 503, error: "not_connected" };
  const token = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7) : "";
  if (!token || token !== sessionSecret) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true };
}
