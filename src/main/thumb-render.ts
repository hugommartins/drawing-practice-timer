import { nativeImage, type NativeImage } from 'electron';

/**
 * Shrinks one image to at most `px` on the longest side and returns JPEG bytes, or null if it can't.
 * Electron-only, and so not covered by the unit tests; tests/e2e checks it in the real app.
 *
 * First choice is the operating system's own thumbnailer (macOS, Windows): it reads big files without
 * decoding them whole and understands more formats than Chromium's image class. If that is not
 * available, PNG and JPEG are decoded and resized here. Anything else returns null and the original
 * file is shown instead, as before.
 */
export async function renderThumbnail(abs: string, px: number): Promise<Buffer | null> {
  try {
    const t = await nativeImage.createThumbnailFromPath(abs, { width: px, height: px });
    if (!t.isEmpty()) return fit(t, px).toJPEG(80);
  } catch {
    /* not supported on this platform, or the file is not one it can read */
  }
  const img = nativeImage.createFromPath(abs);
  if (img.isEmpty()) return null;
  return fit(img, px).toJPEG(80);
}

function fit(img: NativeImage, px: number): NativeImage {
  const { width, height } = img.getSize();
  const scale = Math.min(1, px / Math.max(width, height));
  return scale >= 1 ? img : img.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'good' });
}
