export function fmtMin(m: number): string {
  const n = Math.round(m);
  return n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n}m`;
}

export function fmtSec(s: number): string {
  if (s < 60) return `${s} sec`;
  if (s < 3600) return s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)} min ${s % 60} sec`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** 83 -> "1:23", 3700 -> "1:01:40" */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Parse "90", "1:30" or "1:02:03" into seconds. Returns null when it is not a time. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  let secs = 0;
  if (parts.length === 1) secs = (parts[0] ?? 0) * 60; // bare number = minutes
  else if (parts.length === 2) secs = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  else secs = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return secs > 0 ? secs : null;
}
