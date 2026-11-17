// Procedural reference images for the demo. Deterministic per file name, no external assets.

function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 800;
const H = 600;
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;

function wrap(body: string, bgA: string, bgB: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>${body}</svg>`
  );
}

/** A posed mannequin: capsule limbs from random joint angles. */
function pose(r: () => number): string {
  const hue = 20 + r() * 40;
  const skin = hsl(hue, 35, 62 - r() * 12);
  const cx = 400 + (r() - 0.5) * 120;
  const hip = { x: cx, y: 330 + (r() - 0.5) * 40 };
  const lean = (r() - 0.5) * 0.9;
  const neck = { x: hip.x + Math.sin(lean) * 150, y: hip.y - Math.cos(lean) * 150 };
  const limb = (from: { x: number; y: number }, len: number, ang: number, w: number) => {
    const to = { x: from.x + Math.sin(ang) * len, y: from.y + Math.cos(ang) * len };
    return { to, svg: `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${skin}" stroke-width="${w}" stroke-linecap="round"/>` };
  };
  let svg = `<ellipse cx="${hip.x}" cy="540" rx="150" ry="14" fill="rgba(0,0,0,.18)"/>`;
  svg += `<line x1="${hip.x}" y1="${hip.y}" x2="${neck.x.toFixed(1)}" y2="${neck.y.toFixed(1)}" stroke="${skin}" stroke-width="52" stroke-linecap="round"/>`;
  svg += `<circle cx="${(neck.x + Math.sin(lean) * 52).toFixed(1)}" cy="${(neck.y - Math.cos(lean) * 52).toFixed(1)}" r="34" fill="${skin}"/>`;
  for (const side of [-1, 1]) {
    const a1 = side * (0.25 + r() * 0.9) + (r() - 0.5) * 0.4;
    const u = limb(neck, 100, Math.PI + a1 * 0.9, 22);
    const l = limb(u.to, 95, Math.PI + a1 * 0.9 + (r() - 0.5) * 1.6, 18);
    const b1 = side * (0.1 + r() * 0.5);
    const t = limb(hip, 125, b1, 30);
    const s = limb(t.to, 120, b1 + (r() - 0.5) * 0.9, 24);
    svg += u.svg + l.svg + t.svg + s.svg;
  }
  return wrap(svg, hsl(hue + 160, 12, 90), hsl(hue + 170, 14, 78));
}

/** Boxes, spheres and a cylinder on a table with a soft cast shadow. */
function still(r: () => number): string {
  const hue = r() * 360;
  let svg = `<rect y="380" width="${W}" height="${H - 380}" fill="${hsl(hue + 30, 18, 70)}"/>`;
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = 120 + (i / n) * 560 + r() * 60;
    const sz = 60 + r() * 70;
    const base = 440 + r() * 50;
    const c = hsl(hue + r() * 80, 40 + r() * 20, 50 + r() * 15);
    svg += `<ellipse cx="${(x + sz * 0.5).toFixed(1)}" cy="${base + 6}" rx="${(sz * 0.9).toFixed(1)}" ry="${(sz * 0.18).toFixed(1)}" fill="rgba(0,0,0,.2)"/>`;
    const kind = r();
    if (kind < 0.4) {
      svg += `<circle cx="${x.toFixed(1)}" cy="${(base - sz / 2).toFixed(1)}" r="${(sz / 2).toFixed(1)}" fill="${c}"/>`;
      svg += `<circle cx="${(x - sz * 0.15).toFixed(1)}" cy="${(base - sz * 0.65).toFixed(1)}" r="${(sz * 0.15).toFixed(1)}" fill="rgba(255,255,255,.35)"/>`;
    } else if (kind < 0.75) {
      svg += `<rect x="${(x - sz / 2).toFixed(1)}" y="${(base - sz).toFixed(1)}" width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" fill="${c}"/>`;
      svg += `<polygon points="${x - sz / 2},${base - sz} ${x + sz / 2},${base - sz} ${x + sz / 2 + 22},${base - sz - 22} ${x - sz / 2 + 22},${base - sz - 22}" fill="rgba(255,255,255,.28)"/>`;
    } else {
      svg += `<rect x="${(x - sz / 3).toFixed(1)}" y="${(base - sz * 1.3).toFixed(1)}" width="${((sz * 2) / 3).toFixed(1)}" height="${(sz * 1.3).toFixed(1)}" fill="${c}"/>`;
      svg += `<ellipse cx="${x.toFixed(1)}" cy="${(base - sz * 1.3).toFixed(1)}" rx="${(sz / 3).toFixed(1)}" ry="${(sz / 8).toFixed(1)}" fill="rgba(255,255,255,.3)"/>`;
    }
  }
  return wrap(svg, hsl(hue, 20, 88), hsl(hue + 20, 22, 80));
}

/** Layered hills under a gradient sky. */
function land(r: () => number): string {
  const hue = 190 + r() * 60;
  let svg = `<circle cx="${(120 + r() * 560).toFixed(0)}" cy="${(110 + r() * 80).toFixed(0)}" r="${(34 + r() * 22).toFixed(0)}" fill="rgba(255,244,214,.85)"/>`;
  for (let layer = 0; layer < 5; layer++) {
    const y = 250 + layer * 62;
    let d = `M0 ${H} L0 ${y}`;
    for (let x = 0; x <= W; x += 80) d += ` L${x} ${(y + (r() - 0.5) * 70).toFixed(1)}`;
    d += ` L${W} ${H} Z`;
    svg += `<path d="${d}" fill="${hsl(hue - layer * 14, 28 + layer * 4, 70 - layer * 11)}"/>`;
  }
  return wrap(svg, hsl(hue + 20, 45, 82), hsl(hue, 30, 94));
}

export type ArtKind = 'pose' | 'still' | 'land';

export function art(kind: ArtKind, name: string): string {
  const r = rng(kind + name);
  const svg = kind === 'pose' ? pose(r) : kind === 'still' ? still(r) : land(r);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
