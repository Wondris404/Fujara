export type DiscoveryHit = {
  provider: string;
  title: string;
  artist: string;
  providerTrackId: string;
  pageUrl?: string;
  capabilities: Array<"metadata-search" | "download">;
  audioUrl?: string;
};

type MbRecording = {
  id?: string;
  title?: string;
  "artist-credit"?: { name?: string }[];
};

export function hitsFromMusicBrainz(payload: unknown): DiscoveryHit[] {
  const recordings = (payload as { recordings?: MbRecording[] } | null)?.recordings ?? [];
  return recordings
    .filter((row) => row.id && row.title)
    .map((row) => ({
      provider: "musicbrainz",
      title: row.title ?? "Untitled",
      artist: row["artist-credit"]?.[0]?.name || "Unknown artist",
      providerTrackId: row.id as string,
      pageUrl: `https://musicbrainz.org/recording/${row.id}`,
      capabilities: ["metadata-search"],
    }));
}

const AUDIO_EXT = [".mp3", ".ogg", ".wav", ".flac", ".m4a", ".aac", ".opus"];

export function usableOpenLicense(licenseurl: string | undefined): boolean {
  if (!licenseurl) return false;
  try {
    const url = new URL(licenseurl);
    return url.protocol === "https:" && (url.hostname === "creativecommons.org" || url.hostname.endsWith(".creativecommons.org"));
  } catch {
    return false;
  }
}

export function pickArchiveAudioName(files: { name?: string }[] | undefined): string | null {
  for (const file of files ?? []) {
    const name = file.name ?? "";
    if (!name || name.endsWith("/") || name.includes("..") || name.includes("/") || name.includes("\\")) continue;
    const lower = name.toLowerCase();
    if (AUDIO_EXT.some((ext) => lower.endsWith(ext))) return name;
  }
  return null;
}

type ArchiveDoc = {
  identifier?: string;
  title?: string;
  creator?: string;
  licenseurl?: string;
  files?: { name?: string }[];
};

export function hitsFromArchive(payload: unknown): DiscoveryHit[] {
  const docs = (payload as { response?: { docs?: ArchiveDoc[] } } | null)?.response?.docs ?? [];
  return docs
    .filter((doc) => doc.identifier && doc.title)
    .map((doc) => {
      const pageUrl = `https://archive.org/details/${doc.identifier}`;
      const fileName = usableOpenLicense(doc.licenseurl) ? pickArchiveAudioName(doc.files) : null;
      const audioUrl = fileName ? `https://archive.org/download/${encodeURIComponent(doc.identifier as string)}/${encodeURIComponent(fileName)}` : undefined;
      return {
        provider: "internet-archive",
        title: doc.title ?? "Untitled",
        artist: doc.creator || "Unknown artist",
        providerTrackId: doc.identifier as string,
        pageUrl,
        capabilities: audioUrl ? (["metadata-search", "download"] as DiscoveryHit["capabilities"]) : (["metadata-search"] as DiscoveryHit["capabilities"]),
        audioUrl,
      };
    });
}
