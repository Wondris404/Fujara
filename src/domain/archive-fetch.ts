const MAX_BYTES = 80_000_000;

function allowedArchiveHost(hostname: string): boolean {
  return hostname === "archive.org" || hostname.endsWith(".archive.org");
}

/** Download one Archive audio URL. Redirects and other hosts are rejected. */
export async function fetchArchiveAudio(url: string, fetchImpl: typeof fetch = fetch): Promise<{ bytes: Uint8Array; mime: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !allowedArchiveHost(parsed.hostname)) {
    throw new Error("Only https archive.org audio URLs can be saved.");
  }
  const response = await fetchImpl(parsed.toString(), { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) throw new Error("Archive redirect was blocked.");
  if (!response.ok) throw new Error(`Archive download failed (${response.status}).`);
  const mime = (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  if (!mime.startsWith("audio/") && mime !== "application/octet-stream") throw new Error("Archive did not return audio.");
  const announced = Number(response.headers.get("content-length") ?? "0");
  if (announced > MAX_BYTES) throw new Error("Archive file is larger than 80 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) throw new Error("Archive file is empty or larger than 80 MB.");
  return { bytes, mime: mime === "application/octet-stream" ? "audio/mpeg" : mime };
}
