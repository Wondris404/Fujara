import { createHash } from "node:crypto";

/** Stable UUID v5-style id from a Google subject. Profiles stay uuid columns. */
export function googleSubToUserId(sub: string): string {
  const hash = createHash("sha1").update("fujara-account-v1").update(sub).digest().subarray(0, 16);
  const bytes = Buffer.from(hash);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
