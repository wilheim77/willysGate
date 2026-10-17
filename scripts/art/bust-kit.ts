// Parametric 48x48 bust kit: builds the shape list for portrait-painter.ts from a short
// description (body, hair, face, expression), with the same construction as the hand-painted
// party busts (head ellipse ~24,21; 3-pixel eyes looking slightly right; ramp shading). Used by
// build-portraits.ts for `hand.busts.<id>.kit`; per-character details go in `under`/`shapes`.
import type { Shape } from './portrait-painter.ts';

type Ramp = [string, string, string];

export interface Kit {
  skin: Ramp;
  /** Head: horizontal/vertical radius and centre row (defaults 10.5, 12, 21). */
  head?: { rx?: number; ry?: number; cy?: number; jaw?: boolean };
  ears?: 'round' | 'pointed' | 'none';
  body: { ramp: Ramp; style?: 'coat' | 'broad' | 'narrow' | 'robe' };
  /** What shows at the neck. */
  collar?: { style: 'v' | 'high' | 'scarf' | 'tie' | 'apron' | 'shawl'; ramp: Ramp; tie?: string; shirt?: Ramp };
  hair?: { style: 'bald' | 'short' | 'long' | 'bun' | 'braids' | 'slick' | 'curly' | 'hood' | 'txapela' | 'headscarf' | 'tonsure'; ramp: Ramp; grey?: Ramp };
  beard?: { style: 'full' | 'stubble' | 'moustache' | 'scruffy'; ramp: Ramp };
  eyes?: { style?: 'normal' | 'narrow' | 'blank' | 'closed' | 'glow' | 'wide'; iris?: string; glasses?: string };
  brows?: { style?: 'flat' | 'worried' | 'angry' | 'raised'; color?: string };
  mouth?: 'flat' | 'smile' | 'frown' | 'smirk' | 'grin' | 'fangs' | 'open';
  /** Rosy cheeks, freckles, scar across the face, sweat drop. */
  marks?: ('blush' | 'scar' | 'sweat' | 'wrinkles' | 'freckles')[];
}

const C = 24;

export function kitShapes(k: Kit): { back: Shape[]; front: Shape[] } {
  const rx = k.head?.rx ?? 10.5, ry = k.head?.ry ?? 12, cy = k.head?.cy ?? 21;
  const skin = k.skin;
  const back: Shape[] = [];
  const front: Shape[] = [];
  const top = cy - ry;

  // Body: shoulders from the neck down to the bottom edge.
  const b = k.body;
  const w = b.style === 'broad' ? 22 : b.style === 'narrow' ? 16 : 19;
  const shoulderY = cy + ry - 1;
  back.push({ op: 'poly', points: [[C - w - 3, 48], [C - w + 1, shoulderY + 5], [C - 8, shoulderY], [C + 8, shoulderY], [C + w - 1, shoulderY + 5], [C + w + 3, 48]], ramp: b.ramp });
  if (b.style === 'robe') back.push({ op: 'ellipse', cx: C, cy: shoulderY + 3, rx: w - 3, ry: 4, ramp: b.ramp });

  // Hair behind the head.
  const h = k.hair;
  if (h && h.style !== 'bald' && h.style !== 'tonsure') {
    if (h.style === 'hood' || h.style === 'headscarf') {
      const ex = h.style === 'hood' ? 4 : 2;
      back.push({ op: 'ellipse', cx: C, cy: cy - 1, rx: rx + ex, ry: ry + ex - 1, ramp: h.ramp });
      if (h.style === 'hood') back.push({ op: 'poly', points: [[C - rx - 4, cy], [C + rx + 4, cy], [C + rx + 8, shoulderY + 8], [C - rx - 8, shoulderY + 8]], ramp: h.ramp });
    } else if (h.style === 'curly') {
      back.push({ op: 'ellipse', cx: C, cy: cy - 3, rx: rx + 3, ry: ry - 1, ramp: h.ramp });
    } else if (h.style !== 'txapela') {
      back.push({ op: 'ellipse', cx: C, cy: cy - 2, rx: rx + 1.5, ry: ry, ramp: h.ramp });
    }
    if (h.style === 'long') back.push({ op: 'poly', points: [[C - rx - 2, cy - 4], [C + rx + 2, cy - 4], [C + rx + 3, shoulderY + 9], [C - rx - 3, shoulderY + 9]], ramp: h.ramp });
    if (h.style === 'bun') back.push({ op: 'ellipse', cx: C, cy: top - 1, rx: 5, ry: 4, ramp: h.ramp });
  }

  // Neck and collar.
  back.push({ op: 'rect', x: C - 4, y: cy + ry - 5, w: 8, h: 7, ramp: skin });
  const col = k.collar;
  if (col) {
    const y0 = shoulderY;
    if (col.style === 'v' || col.style === 'tie') {
      const shirt = col.shirt ?? col.ramp;
      back.push({ op: 'poly', points: [[C - 7, y0], [C + 7, y0], [C, y0 + 10]], ramp: shirt });
      if (col.style === 'tie') back.push({ op: 'poly', points: [[C - 1, y0 + 1], [C + 1, y0 + 1], [C + 2, y0 + 10], [C, y0 + 13], [C - 2, y0 + 10]], color: col.tie ?? '#8e1f3a', flat: true });
      back.push({ op: 'line', points: [[C - 8, y0], [C, y0 + 12]], color: col.ramp[0] });
      back.push({ op: 'line', points: [[C + 7, y0], [C, y0 + 12]], color: col.ramp[0] });
    } else if (col.style === 'high') {
      back.push({ op: 'poly', points: [[C - 7, y0 - 3], [C + 7, y0 - 3], [C + 9, y0 + 3], [C - 9, y0 + 3]], ramp: col.ramp });
    } else if (col.style === 'scarf') {
      back.push({ op: 'ellipse', cx: C, cy: y0 + 1, rx: 9, ry: 3.5, ramp: col.ramp });
      back.push({ op: 'poly', points: [[C + 2, y0 + 2], [C + 7, y0 + 2], [C + 6, y0 + 11], [C + 2, y0 + 10]], ramp: col.ramp });
    } else if (col.style === 'apron') {
      back.push({ op: 'poly', points: [[C - 9, y0 + 6], [C + 9, y0 + 6], [C + 10, 48], [C - 10, 48]], ramp: col.ramp });
      back.push({ op: 'line', points: [[C - 9, y0 + 6], [C - 6, y0]], color: col.ramp[1] });
      back.push({ op: 'line', points: [[C + 8, y0 + 6], [C + 5, y0]], color: col.ramp[1] });
    } else if (col.style === 'shawl') {
      back.push({ op: 'poly', points: [[C - 14, y0 + 3], [C - 6, y0 - 1], [C + 6, y0 - 1], [C + 14, y0 + 3], [C, y0 + 11]], ramp: col.ramp });
    }
  }

  // Ears.
  const ears = k.ears ?? 'round';
  if (ears === 'round') {
    back.push({ op: 'ellipse', cx: C - rx - 0.5, cy: cy + 1, rx: 2.2, ry: 3.2, ramp: skin });
    back.push({ op: 'ellipse', cx: C + rx + 0.5, cy: cy + 1, rx: 2.2, ry: 3.2, ramp: skin });
  } else if (ears === 'pointed') {
    back.push({ op: 'poly', points: [[C - rx + 1, cy - 1], [C - rx - 6, cy - 6], [C - rx + 1, cy + 4]], ramp: skin });
    back.push({ op: 'poly', points: [[C + rx - 1, cy - 1], [C + rx + 6, cy - 6], [C + rx - 1, cy + 4]], ramp: skin });
  }

  // Head (a square jaw goes under the ellipse so its lit top edge is hidden).
  if (k.head?.jaw) back.push({ op: 'poly', points: [[C - rx, cy], [C + rx, cy], [C + rx - 1, cy + ry - 3], [C + 4, cy + ry], [C - 4, cy + ry], [C - rx + 1, cy + ry - 3]], ramp: skin });
  back.push({ op: 'ellipse', cx: C, cy, rx, ry, ramp: skin });

  // Hair in front: fringe / cap.
  if (h) {
    const r = h.ramp;
    switch (h.style) {
      case 'short': case 'long': case 'bun': case 'braids': case 'curly':
        front.push({ op: 'poly', points: [[C - rx - 1, cy - 1], [C - rx + 1, top + 3], [C - 3, top - 1], [C + 5, top], [C + rx, top + 4], [C + rx + 1, cy - 1], [C + rx - 2, cy - 4], [C + 3, top + 5], [C - 4, top + 6], [C - rx + 2, cy - 3]], ramp: r });
        break;
      case 'slick':
        front.push({ op: 'poly', points: [[C - rx - 1, cy - 1], [C - rx + 1, top + 2], [C, top - 1], [C + rx, top + 3], [C + rx + 1, cy - 2], [C + rx - 2, top + 6], [C - 2, top + 5], [C - rx + 2, cy - 4]], ramp: r });
        front.push({ op: 'line', points: [[C - 4, top + 1], [C + 5, top + 2]], color: r[2] });
        break;
      case 'hood':
        front.push({ op: 'poly', points: [[C - rx - 1, cy], [C - rx + 1, top + 2], [C, top - 1], [C + rx - 1, top + 2], [C + rx + 1, cy], [C + rx - 2, cy - 4], [C, top + 4], [C - rx + 2, cy - 4]], ramp: r });
        break;
      case 'headscarf':
        front.push({ op: 'poly', points: [[C - rx - 1, cy + 1], [C - rx + 1, top + 2], [C, top - 1], [C + rx - 1, top + 2], [C + rx + 1, cy + 1], [C + rx - 2, top + 6], [C, top + 5], [C - rx + 2, top + 6]], ramp: r });
        break;
      case 'txapela':
        front.push({ op: 'ellipse', cx: C - 1, cy: top + 3, rx: rx + 3, ry: 4, ramp: r });
        front.push({ op: 'px', color: r[0], at: [[C - 1, top - 2], [C - 1, top - 1]] });
        break;
      case 'tonsure':
        front.push({ op: 'poly', points: [[C - rx - 1, cy + 2], [C - rx, cy - 5], [C - rx + 3, cy - 3], [C - rx + 2, cy + 3]], ramp: r });
        front.push({ op: 'poly', points: [[C + rx + 1, cy + 2], [C + rx, cy - 5], [C + rx - 3, cy - 3], [C + rx - 2, cy + 3]], ramp: r });
        break;
      case 'bald':
        front.push({ op: 'px', color: skin[2], at: [[C - 4, top + 2], [C - 3, top + 2], [C - 5, top + 3]] });
        break;
    }
    if (h.style === 'braids') {
      for (const s of [-1, 1]) {
        const x = C + s * (rx + 1);
        front.push({ op: 'poly', points: [[x - 2, cy - 2], [x + 2, cy - 2], [x + 2 + s, shoulderY + 10], [x - 2 + s, shoulderY + 10]], ramp: r });
        for (let y = cy + 1; y < shoulderY + 10; y += 3) front.push({ op: 'line', points: [[x - 2 + s, y], [x + 1 + s, y + 1]], color: r[0] });
      }
    }
    if (h.style === 'curly') {
      const curls: number[][] = [[C - rx, top + 4], [C - 5, top], [C + 2, top - 1], [C + rx - 2, top + 3], [C - rx - 2, cy - 4], [C + rx + 1, cy - 4]];
      for (const [x, y] of curls) front.push({ op: 'ellipse', cx: x!, cy: y!, rx: 2.8, ry: 2.6, ramp: r });
    }
    if (h.grey) front.push({ op: 'px', color: h.grey[2], at: [[C - rx, cy - 2], [C - rx, cy - 1], [C + rx - 1, cy - 2], [C + rx - 1, cy - 1]] });
  }

  // Face.
  const ey = cy + 1;
  const dark = '#1e1618';
  const brows = k.brows ?? {};
  const bc = brows.color ?? h?.ramp[0] ?? skin[0];
  const by = ey - 2;
  const browPx: Record<string, number[][]> = {
    flat: [[C - 6, by], [C - 5, by], [C - 4, by], [C + 3, by], [C + 4, by], [C + 5, by]],
    worried: [[C - 6, by], [C - 5, by - 1], [C - 4, by - 1], [C + 3, by - 1], [C + 4, by - 1], [C + 5, by]],
    angry: [[C - 6, by - 1], [C - 5, by], [C - 4, by + 1], [C + 3, by + 1], [C + 4, by], [C + 5, by - 1]],
    raised: [[C - 6, by - 1], [C - 5, by - 2], [C - 4, by - 1], [C + 3, by - 2], [C + 4, by - 2], [C + 5, by - 1]],
  };
  front.push({ op: 'px', color: bc, at: browPx[brows.style ?? 'flat']! });
  const e = k.eyes ?? {};
  const iris = e.iris ?? '#5a4a3a';
  const L = [C - 6, C - 5, C - 4], R = [C + 3, C + 4, C + 5];
  switch (e.style ?? 'normal') {
    case 'normal': case 'wide': case 'glow':
      front.push({ op: 'px', color: '#ece6dc', at: [[L[0]!, ey], [R[0]!, ey]] });
      front.push({ op: 'px', color: e.style === 'glow' ? '#ff3040' : iris, at: [[L[1]!, ey], [R[1]!, ey]] });
      front.push({ op: 'px', color: dark, at: [[L[2]!, ey], [R[2]!, ey]] });
      if (e.style === 'wide') front.push({ op: 'px', color: '#ece6dc', at: [[L[1]!, ey - 1], [R[1]!, ey - 1], [L[1]!, ey + 1], [R[1]!, ey + 1]] });
      break;
    case 'narrow':
      front.push({ op: 'px', color: dark, at: [[L[0]!, ey], [L[1]!, ey], [L[2]!, ey], [R[0]!, ey], [R[1]!, ey], [R[2]!, ey]] });
      front.push({ op: 'px', color: iris, at: [[L[1]!, ey], [R[1]!, ey]] });
      break;
    case 'blank':
      front.push({ op: 'px', color: '#d8dce0', at: [[L[0]!, ey], [L[1]!, ey], [L[2]!, ey], [R[0]!, ey], [R[1]!, ey], [R[2]!, ey]] });
      front.push({ op: 'px', color: '#9aa2a8', at: [[L[1]!, ey], [R[1]!, ey]] });
      front.push({ op: 'px', color: skin[0], at: [[L[0]!, ey + 1], [L[2]!, ey + 1], [R[0]!, ey + 1], [R[2]!, ey + 1], [L[1]!, ey - 1], [R[1]!, ey - 1]] });
      break;
    case 'closed':
      front.push({ op: 'px', color: dark, at: [[L[0]!, ey], [L[1]!, ey + 1], [L[2]!, ey], [R[0]!, ey], [R[1]!, ey + 1], [R[2]!, ey]] });
      break;
  }
  if (e.glasses) {
    for (const xs of [L, R]) {
      front.push({ op: 'line', points: [[xs[0]! - 1, ey - 1], [xs[2]! + 1, ey - 1]], color: e.glasses });
      front.push({ op: 'line', points: [[xs[0]! - 1, ey + 1], [xs[2]! + 1, ey + 1]], color: e.glasses });
      front.push({ op: 'px', color: e.glasses, at: [[xs[0]! - 1, ey], [xs[2]! + 1, ey]] });
    }
    front.push({ op: 'px', color: e.glasses, at: [[C - 2, ey - 1], [C - 1, ey - 1], [C, ey - 1], [C + 1, ey - 1]] });
  }
  // Nose: a shaded side and a lit ridge.
  front.push({ op: 'px', color: skin[0], at: [[C + 1, ey + 1], [C + 1, ey + 2], [C + 1, ey + 3], [C, ey + 4]] });
  front.push({ op: 'px', color: skin[2], at: [[C, ey + 2], [C, ey + 3]] });

  // Beard before the mouth, so the mouth reads on top.
  const bd = k.beard;
  const my = cy + 6;
  if (bd) {
    if (bd.style === 'full' || bd.style === 'scruffy') {
      const len = bd.style === 'scruffy' ? 5 : 4;
      front.push({ op: 'poly', points: [[C - rx + 0.5, cy + 1], [C - rx + 3, my], [C - 5, my - 1], [C + 5, my - 1], [C + rx - 3, my], [C + rx - 0.5, cy + 1], [C + rx - 1, cy + ry - 2], [C + 3, cy + ry + len], [C - 3, cy + ry + len], [C - rx + 1, cy + ry - 2]], ramp: bd.ramp });
      if (bd.style === 'scruffy') front.push({ op: 'px', color: bd.ramp[0], at: [[C - 3, cy + ry + len], [C + 2, cy + ry + len + 1], [C - rx + 1, cy + ry - 1], [C + rx - 2, cy + ry]] });
    } else if (bd.style === 'moustache') {
      front.push({ op: 'poly', points: [[C - 5, my], [C - 1, my - 2], [C + 1, my - 2], [C + 5, my], [C + 3, my], [C, my - 1], [C - 3, my]], ramp: bd.ramp });
    } else {
      const at: number[][] = [];
      for (let y = my - 2; y < cy + ry - 1; y++) for (let x = C - rx + 2; x < C + rx - 2; x++) if ((x + y) % 2 === 0 && Math.abs(x - C) > 3 - (y > my ? 3 : 0)) at.push([x, y]);
      front.push({ op: 'px', color: bd.ramp[0], at });
    }
  }

  const lip = '#6a3a34';
  const mouths: Record<string, Shape[]> = {
    flat: [{ op: 'line', points: [[C - 3, my], [C + 2, my]], color: lip }],
    smile: [{ op: 'line', points: [[C - 4, my - 1], [C - 3, my], [C + 2, my], [C + 3, my - 1]], color: lip }],
    frown: [{ op: 'line', points: [[C - 4, my + 1], [C - 3, my], [C + 2, my], [C + 3, my + 1]], color: lip }],
    smirk: [{ op: 'line', points: [[C - 3, my], [C + 2, my], [C + 4, my - 2]], color: lip }],
    grin: [{ op: 'line', points: [[C - 5, my - 1], [C - 4, my], [C + 3, my], [C + 4, my - 1]], color: lip }, { op: 'px', color: '#f4ece0', at: [[C - 3, my + 1], [C - 2, my + 1], [C - 1, my + 1], [C, my + 1], [C + 1, my + 1], [C + 2, my + 1]] }, { op: 'line', points: [[C - 3, my + 2], [C + 2, my + 2]], color: lip }],
    fangs: [{ op: 'line', points: [[C - 5, my - 1], [C - 4, my], [C + 3, my], [C + 4, my - 1]], color: lip }, { op: 'px', color: '#f4f0f0', at: [[C - 3, my + 1], [C + 2, my + 1]] }],
    open: [{ op: 'rect', x: C - 2, y: my - 1, w: 4, h: 3, color: '#3a1a1a', flat: true }, { op: 'line', points: [[C - 2, my - 1], [C + 1, my - 1]], color: '#f4ece0' }],
  };
  front.push(...mouths[k.mouth ?? 'flat']!);

  for (const m of k.marks ?? []) {
    if (m === 'blush') front.push({ op: 'px', color: '#d87a68', at: [[C - 8, ey + 3], [C - 7, ey + 3], [C + 6, ey + 3], [C + 7, ey + 3]] });
    if (m === 'freckles') front.push({ op: 'px', color: skin[0], at: [[C - 7, ey + 3], [C - 5, ey + 4], [C + 4, ey + 4], [C + 6, ey + 3]] });
    if (m === 'wrinkles') front.push({ op: 'px', color: skin[0], at: [[C - 8, ey], [C - 8, ey + 1], [C + 7, ey], [C + 7, ey + 1], [C - 4, my + 2], [C + 3, my + 2], [C - 2, by - 3], [C - 1, by - 3], [C, by - 3], [C + 1, by - 3]] });
    if (m === 'scar') front.push({ op: 'line', points: [[C + 2, by - 3], [C + 7, ey + 4]], color: '#c8806a' });
    if (m === 'sweat') front.push({ op: 'px', color: '#a8d8f0', at: [[C - rx + 1, by - 1], [C - rx + 1, by], [C - rx, by + 1], [C - rx + 1, by + 1]] });
  }
  // Pixels and lines must land on whole pixels (the radii can be fractional).
  const snap = (list: Shape[]) => list.map((sh) => sh.op === 'px' ? { ...sh, at: sh.at.map(([x, y]) => [Math.round(x!), Math.round(y!)]) }
    : sh.op === 'line' ? { ...sh, points: sh.points.map(([x, y]) => [Math.round(x!), Math.round(y!)]) } : sh);
  return { back: snap(back), front: snap(front) };
}
