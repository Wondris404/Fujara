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

type ArchiveDoc = {
  identifier?: string;
  title?: string;
  creator?: string;
  licenseurl?: string;
};

export function hitsFromArchive(payload: unknown): DiscoveryHit[] {
  const docs = (payload as { response?: { docs?: ArchiveDoc[] } } | null)?.response?.docs ?? [];
  return docs
    .filter((doc) => doc.identifier && doc.title)
    .map((doc) => {
      const pageUrl = `https://archive.org/details/${doc.identifier}`;
      const audioUrl = doc.licenseurl ? `https://archive.org/download/${doc.identifier}/${doc.identifier}.mp3` : undefined;
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
