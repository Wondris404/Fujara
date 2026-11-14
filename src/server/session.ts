function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToB64Url(new Uint8Array(mac));
}

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export async function issueSession(userId: string, secret: string, now = Date.now()): Promise<string> {
  if (!secret || !userId) throw new Error("Session secret and user id are required.");
  const payload = bytesToB64Url(new TextEncoder().encode(JSON.stringify({ uid: userId, v: 1, exp: now + SESSION_MS })));
  return `${payload}.${await sign(secret, payload)}`;
}

export async function readSession(token: string | null | undefined, secret: string | undefined): Promise<string | null> {
  if (!token || !secret || token === secret) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = await sign(secret, payload);
  if (expected !== mac) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payload))) as { uid?: string; exp?: number };
    if (typeof body.exp === "number" && body.exp < Date.now()) return null;
    return body.uid || null;
  } catch {
    return null;
  }
}
