import { ACCEPTED_EXTENSIONS, MAX_IMPORT_BYTES } from "./types";

const MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
]);

const EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  aac: "audio/aac",
};

export function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function classifyAudioFile(
  name: string,
  mime: string,
  size: number,
): { ok: true; mime: string } | { ok: false; reason: string } {
  if (size <= 0) return { ok: false, reason: "The file is empty." };
  if (size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      reason: `File is larger than ${Math.round(MAX_IMPORT_BYTES / 1_000_000)} MB. Fujara did not store it.`,
    };
  }
  const ext = extensionOf(name);
  const normalized = mime.toLowerCase().split(";")[0].trim();
  if (normalized && MIME.has(normalized)) return { ok: true, mime: normalized };
  if ((ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: true, mime: EXT_MIME[ext] ?? "application/octet-stream" };
  }
  return {
    ok: false,
    reason: `Unsupported format. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
  };
}

export function metadataFromFilename(name: string): { title: string; artist: string } {
  const base = (name.split(/[/\\]/).pop() ?? name).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const artist = parts[0].trim() || "Unknown artist";
    const title = parts.slice(1).join(" - ").trim() || "Untitled";
    return { title, artist };
  }
  return { artist: "Unknown artist", title: base || "Untitled" };
}

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return name === "QuotaExceededError" || /quota/i.test(message);
}
