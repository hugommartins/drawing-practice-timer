// Dependency-free animated GIF writer for the README capture script.
// decodePng: 8-bit RGB/RGBA PNG (what Playwright screenshots are) -> { width, height, rgba }.
// GifWriter: one 256-colour palette per frame (median cut), LZW, loops forever.
import zlib from 'node:zlib';

export function decodePng(buf) {
  let p = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12] !== 0 || (type !== 2 && type !== 6)) throw new Error('unsupported PNG (need 8-bit RGB/RGBA, not interlaced)'); }
    else if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) { rgba[i * 4] = px[j]; rgba[i * 4 + 1] = px[j + 1]; rgba[i * 4 + 2] = px[j + 2]; rgba[i * 4 + 3] = 255; }
  return { width, height, rgba };
}

// Median cut on a sample of the pixels -> up to 256 [r, g, b].
function palette(rgba) {
  const pts = [];
  for (let i = 0; i < rgba.length; i += 16) pts.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  let boxes = [pts];
  while (boxes.length < 256) {
    let bi = -1, best = 0, ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        const score = (hi - lo) * Math.sqrt(b.length);
        if (score > best) { best = score; bi = i; ch = c; }
      }
    });
    if (bi === -1) break;
    const b = boxes[bi].sort((p, q) => p[ch] - q[ch]), m = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  return boxes.map((b) => { const s = [0, 0, 0]; for (const p of b) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map((v) => Math.round(v / b.length)); });
}

function indexFrame(rgba, pal) {
  const cache = new Int16Array(32768).fill(-1), out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const k = ((rgba[j] >> 3) << 10) | ((rgba[j + 1] >> 3) << 5) | (rgba[j + 2] >> 3);
    let c = cache[k];
    if (c < 0) {
      let bd = Infinity;
      for (let n = 0; n < pal.length; n++) { const dr = pal[n][0] - rgba[j], dg = pal[n][1] - rgba[j + 1], db = pal[n][2] - rgba[j + 2], d = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (d < bd) { bd = d; c = n; } }
      cache[k] = c;
    }
    out[i] = c;
  }
  return out;
}

function lzw(indices) {
  const out = [], CLEAR = 256, EOI = 257;
  let bits = 9, next = 258, dict = new Map(), cur = 0, nbits = 0;
  const put = (code) => { cur |= code << nbits; nbits += bits; while (nbits >= 8) { out.push(cur & 255); cur >>>= 8; nbits -= 8; } };
  put(CLEAR);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix * 256 + k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    put(prefix);
    if (next < 4096) { dict.set(key, next++); if (next - 1 === (1 << bits) && bits < 12) bits++; }
    else { put(CLEAR); dict = new Map(); next = 258; bits = 9; }
    prefix = k;
  }
  put(prefix); put(EOI);
  if (nbits > 0) out.push(cur & 255);
  return out;
}

export class GifWriter {
  constructor(width, height) { this.w = width; this.h = height; this.parts = [Buffer.from('GIF89a'), Buffer.from([width & 255, width >> 8, height & 255, height >> 8, 0x00, 0, 0]), Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0])]; this.frames = 0; }
  addFrame(rgba, delayMs) {
    const pal = palette(rgba); while (pal.length < 256) pal.push([0, 0, 0]);
    const idx = indexFrame(rgba, pal), cs = Math.max(1, Math.round(delayMs / 10));
    this.parts.push(Buffer.from([0x21, 0xf9, 4, 0x04, cs & 255, cs >> 8, 0, 0]));
    this.parts.push(Buffer.from([0x2c, 0, 0, 0, 0, this.w & 255, this.w >> 8, this.h & 255, this.h >> 8, 0x87]));
    this.parts.push(Buffer.from(pal.flat()));
    const data = lzw(idx), blocks = [8];
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); blocks.push(n, ...data.slice(i, i + n)); }
    blocks.push(0);
    this.parts.push(Buffer.from(blocks));
    this.frames++;
  }
  finish() { return Buffer.concat([...this.parts, Buffer.from([0x3b])]); }
}
