import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full.replaceAll("\\", "/"));
  }
}

const root = join(process.cwd(), ".next", "static");
const files = [];
await walk(root, files);
const assets = files
  .map((file) => `/_next/static/${file.slice(root.replaceAll("\\", "/").length + 1)}`)
  .filter((file) => !file.includes(".."));
await writeFile(join(process.cwd(), "public", "shell-assets.json"), JSON.stringify({ assets }));
console.log(`shell assets ${assets.length}`);
