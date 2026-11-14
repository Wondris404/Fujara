import { hitsFromArchive, hitsFromMusicBrainz, type DiscoveryHit } from "@/domain/sources-parse";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ hits: [] satisfies DiscoveryHit[] });
  const hits: DiscoveryHit[] = [];
  try {
    const mb = await fetch(`https://musicbrainz.org/ws/2/recording?fmt=json&limit=5&query=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Fujara/0.1 (https://github.com/Wondris404/Fujara)" },
    });
    if (mb.ok) hits.push(...hitsFromMusicBrainz(await mb.json()));
  } catch {
    // A source outage is an empty addition, not invented rows.
  }
  try {
    const archive = await fetch(
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}%20mediatype:audio&fl[]=identifier,title,creator,licenseurl&rows=5&output=json`,
    );
    if (archive.ok) hits.push(...hitsFromArchive(await archive.json()));
  } catch {
    // Same as above.
  }
  return NextResponse.json({ hits });
}
