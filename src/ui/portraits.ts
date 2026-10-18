import { type AssetManifest, type Rect, assetUrl } from '../assets/manifest';

/**
 * Small pixel-art portraits for the HUD. Uses a dedicated portrait from the manifest when
 * the art preset has one; otherwise crops the head and shoulders of the sprite's first
 * idle frame. Images are loaded once and shared.
 */
const images = new Map<string, Promise<HTMLImageElement>>();

function load(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = assetUrl(url);
    });
    images.set(url, p);
  }
  return p;
}

/** Source rectangle for a sprite's portrait: [image url, frame rect, crop the bust?]. */
function sourceOf(manifest: AssetManifest, spriteId: string): [string, Rect, boolean] | null {
  const portrait = manifest.portraits?.[spriteId];
  if (portrait) return [portrait.url, portrait, false];
  const art = manifest.sprites[spriteId];
  if (!art) return null;
  if (art.kind === 'frames') {
    const frame = (art.animations.idle ?? Object.values(art.animations)[0])?.[0];
    return frame ? [art.url, frame, true] : null;
  }
  // LPC: first frame of the south-facing walk row.
  const walk = art.animations.walk ?? Object.values(art.animations)[0];
  if (!walk) return null;
  const size = walk.frameSize;
  return [art.url, { x: 0, y: walk.y + (walk.rows === 4 ? 2 * size : 0), w: size, h: size }, true];
}

/** Opaque bounds of a canvas, so the bust crop starts at the top of the head. */
function opaqueBounds(ctx: CanvasRenderingContext2D, w: number, h: number): Rect {
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX < 0 ? { x: 0, y: 0, w, h } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** A canvas showing the portrait; drawn as soon as the image loads. */
export function portrait(manifest: AssetManifest, spriteId: string, size = 44): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'portrait';
  const source = sourceOf(manifest, spriteId);
  if (!source) return canvas;
  const [url, r, bust] = source;
  void load(url)
    .then((img) => {
      const frame = document.createElement('canvas');
      frame.width = r.w;
      frame.height = r.h;
      const fctx = frame.getContext('2d', { willReadFrequently: true })!;
      fctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      let crop: Rect = { x: 0, y: 0, w: r.w, h: r.h };
      if (bust) {
        // Head and shoulders: a square as wide as the figure, from the top of the head.
        const b = opaqueBounds(fctx, r.w, r.h);
        const side = Math.min(Math.max(b.w, Math.round(b.h * 0.55)), r.h - b.y);
        crop = { x: Math.max(0, Math.round(b.x + b.w / 2 - side / 2)), y: b.y, w: side, h: side };
      }
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      // Whole-pixel enlargement; shrink to fit only when the portrait is bigger than the slot.
      const side = Math.max(crop.w, crop.h);
      const scale = size >= side ? Math.floor(size / side) : size / side;
      const w = crop.w * scale;
      const h = crop.h * scale;
      ctx.drawImage(frame, crop.x, crop.y, crop.w, crop.h, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    })
    .catch(() => undefined);
  return canvas;
}

/** One piece of UI art (manifest `ui`: icons, badges, box frames), whole-pixel scaled; empty if missing. */
export function uiIcon(manifest: AssetManifest | null, id: string, size = 32): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'ui-icon';
  const entry = (manifest as unknown as { ui?: Record<string, Rect & { url: string }> } | null)?.ui?.[id];
  if (!entry) {
    canvas.classList.add('missing');
    return canvas;
  }
  void load(entry.url)
    .then((img) => {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const side = Math.max(entry.w, entry.h);
      const scale = size >= side ? Math.floor(size / side) : size / side;
      const w = entry.w * scale;
      const h = entry.h * scale;
      ctx.drawImage(img, entry.x, entry.y, entry.w, entry.h, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    })
    .catch(() => canvas.classList.add('missing'));
  return canvas;
}

/** Whether the art preset has this UI piece. */
export function hasUiArt(manifest: AssetManifest | null, id: string): boolean {
  return !!(manifest as unknown as { ui?: Record<string, unknown> } | null)?.ui?.[id];
}
