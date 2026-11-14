import { deflateSync, crc32 } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 3;
      raw[i] = 0xc6;
      raw[i + 1] = 0x8b;
      raw[i + 2] = 0x4a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = join(process.cwd(), "public", "icons");
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "icon-192.png"), png(192));
await writeFile(join(dir, "icon-512.png"), png(512));
await writeFile(join(dir, "apple-touch-icon.png"), png(180));
console.log(dir);
