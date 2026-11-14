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
    if (archive.ok) {
      const payload = (await archive.json()) as { response?: { docs?: { identifier?: string; title?: string; creator?: string }[] } };
      for (const doc of payload.response?.docs ?? []) {
        if (!doc.identifier) continue;
        let licenseurl: string | undefined;
        let files: { name?: string }[] | undefined;
        try {
          const meta = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
          if (meta.ok) {
            const body = (await meta.json()) as { metadata?: { licenseurl?: string }; files?: { name?: string }[] };
            licenseurl = body.metadata?.licenseurl;
            files = body.files;
          }
        } catch {
          licenseurl = undefined;
        }
        hits.push(...hitsFromArchive({ response: { docs: [{ ...doc, licenseurl, files }] } }));
      }
    }
  } catch {
    // Same as above.
  }
  return NextResponse.json({ hits });
}
