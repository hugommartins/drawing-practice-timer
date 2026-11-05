import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A small diagonal-gradient PNG. Different `seed` values give visibly different images. */
export function makePng(width: number, height: number, seed: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      raw[i] = (x * 255) / width + seed * 40;
      raw[i + 1] = (y * 255) / height + seed * 70;
      raw[i + 2] = ((x + y) * 255) / (width + height) + seed * 20;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Creates `count` PNGs in `dir` (names like fig_001.png), one nested subfolder, and a few
 * files that must be ignored. Returns the expected relative image paths, sorted.
 */
export function makeReferenceFolder(dir: string, count: number, prefix = 'fig'): string[] {
  mkdirSync(path.join(dir, 'poses'), { recursive: true });
  const rel: string[] = [];
  for (let i = 1; i <= count; i++) {
    const name = `${prefix}_${String(i).padStart(3, '0')}.png`;
    const sub = i % 4 === 0 ? 'poses/' : '';
    writeFileSync(path.join(dir, sub + name), makePng(120, 160, i));
    rel.push(sub + name);
  }
  writeFileSync(path.join(dir, 'notes.txt'), 'not an image');
  writeFileSync(path.join(dir, '.hidden.png'), makePng(8, 8, 1));
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return rel.sort((a, b) => collator.compare(a, b));
}
