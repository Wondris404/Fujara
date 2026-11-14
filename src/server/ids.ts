import { createHash } from "node:crypto";

function uuidFrom(label: string): string {
  const hash = createHash("sha1").update(label).digest().subarray(0, 16);
  const bytes = Buffer.from(hash);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable UUID for one playlist membership. Safe for the uuid column and repeatable. */
export function playlistItemId(playlistId: string, trackId: string): string {
  return uuidFrom(`fujara-playlist-item-v1:${playlistId}:${trackId}`);
}

export function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
