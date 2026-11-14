import { readSession } from "@/server/session";

export function cookieValue(header: string | null, name: string): string | null {
  const parts = header?.split(";") ?? [];
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function userIdFromRequest(request: Request): Promise<string | null> {
  const secret = process.env.FUJARA_SESSION_SECRET;
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const cookie = cookieValue(request.headers.get("cookie"), "fujara_session");
  return readSession(bearer || cookie, secret);
}
