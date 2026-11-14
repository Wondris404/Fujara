export type SourceCapability =
  | "metadata-search"
  | "hosted-playback"
  | "download"
  | "external-auth"
  | "manual-import";

export type MusicSource = {
  id: string;
  label: string;
  operational: boolean;
  mock: boolean;
  capabilities: SourceCapability[];
  note: string;
};

export const SOURCES: MusicSource[] = [
  {
    id: "local-file",
    label: "Files on this device",
    operational: true,
    mock: false,
    capabilities: ["manual-import"],
    note: "You pick a file. Fujara stores it in this browser profile.",
  },
  {
    id: "mock-catalogue",
    label: "Mock catalogue (tests only)",
    operational: false,
    mock: true,
    capabilities: ["metadata-search"],
    note: "Disabled unless NEXT_PUBLIC_ENABLE_MOCK_SOURCE=true. Results are fake and labeled.",
  },
];

export function enabledSources(mockEnabled: boolean): MusicSource[] {
  return SOURCES.filter((source) => source.operational || (source.mock && mockEnabled));
}

export type CatalogueHit = {
  provider: string;
  title: string;
  artist: string;
  mock: true;
};

export function searchMockCatalogue(query: string): CatalogueHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return [
    {
      provider: "mock-catalogue",
      title: `Mock result for “${query.trim()}”`,
      artist: "Not a real recording",
      mock: true,
    },
  ];
}
