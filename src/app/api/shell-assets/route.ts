import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function walk(dir: string, root: string, into: string[]) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, root, into);
      continue;
    }
    if (name.endsWith(".map")) continue;
    const relative = path.relative(root, full);
    if (relative.startsWith("..")) continue;
    into.push("/_next/static/" + relative.split(path.sep).join("/"));
  }
}

export function GET() {
  const root = path.join(process.cwd(), ".next", "static");
  const assets: string[] = [];
  try {
    walk(root, root, assets);
  } catch {
    return NextResponse.json({ assets: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ assets }, { headers: { "Cache-Control": "no-store" } });
}
