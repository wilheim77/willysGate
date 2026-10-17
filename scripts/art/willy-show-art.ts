// Willy el mazmorrero, P2: stage props (spotlights, camera drones, the «EN DIRECTO» sign,
// carts, lighting rig), its surfaces (expedientes, marbles, net, toxic, steam...), effects
// (voltaic arc, the Ingeniero's G waves, flying forms, ball trail, confetti) and HUD icons.
// Pure drawing functions; build-willy-art.ts packs them and writes the manifest.
import { type Image, blank } from './png.ts';
import { type Rgb, hexToRgb } from './color.ts';
import { bayer, rng, valueNoise } from './pixel.ts';
import { drawText, textWidth } from './font.ts';

const T = 16;
const OUT = '#1e1c24';

export function px(img: Image, x: number, y: number, col: string | Rgb | null, a = 255): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  if (!col) return void (img.data[i + 3] = 0);
  const c = typeof col === 'string' ? hexToRgb(col) : col;
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], a];
}
function fill(img: Image, x: number, y: number, w: number, h: number, col: string, a = 255): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(img, xx, yy, col, a);
}
function art(img: Image, x0: number, y0: number, rows: string[], legend: Record<string, string>): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === ' ') return;
    const col = legend[ch];
    if (!col) throw new Error(`no colour for "${ch}"`);
    px(img, x0 + x, y0 + y, col);
  }));
}
function line(img: Image, x0: number, y0: number, x1: number, y1: number, col: string, a = 255): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) px(img, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col, a);
}
function disc(img: Image, cx: number, cy: number, r: number, col: string, a = 255): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(img, x, y, col, a);
}
function ring(img: Image, cx: number, cy: number, r: number, col: string, w = 1, a = 255): void {
  for (let y = Math.floor(cy - r - w); y <= cy + r + w; y++) for (let x = Math.floor(cx - r - w); x <= cx + r + w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r && d > r - w) px(img, x, y, col, a);
  }
}
/** Dark outline around everything opaque. */
function outline(img: Image, col = OUT): Image {
  const out = blank(img.width, img.height);
  img.data.copy(out.data);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const xx = x + dx!, yy = y + dy!;
      return xx >= 0 && yy >= 0 && xx < img.width && yy < img.height && img.data[(yy * img.width + xx) * 4 + 3]! > 200;
    });
    if (near) px(out, x, y, col);
  }
  return out;
}

// --- Stage props ------------------------------------------------------------------------------

/** Moving spotlight on a stand; the head swings left, centre, right (3 frames). */
export function spotlight(frame: number): Image {
  const img = blank(T, 20);
  art(img, 4, 13, ['...kk...', '...kk...', '..kkkk..', '.kkkkkk.', 'kk.kk.kk', 'k..kk..k', 'k..kk..k'], { k: '#3a3e46' });
  const heads = [
    ['..kkkk..', '.kMMMMk.', 'kMMMMMMk', 'kMWWWWMk', '.kWYYWk.', '..kkkk..'],
    ['.kkkk...', 'kMMMMk..', 'kMMMMMk.', 'kWWWMMk.', 'kYYWMk..', '.kkkk...'],
    ['...kkkk.', '..kMMMMk', '.kMMMMMk', '.kMMWWWk', '..kMWYYk', '...kkkk.'],
  ][frame]!;
  art(img, 4, 6, heads, { k: OUT, M: '#5a5e66', W: '#fff4c0', Y: '#ffe04f' });
  art(img, 6, 11, ['kkkk', '.kk.'], { k: OUT });
  return img;
}

/** The spotlight's cone of light (translucent, drawn additively by the client if it can). */
export function lightCone(): Image {
  const img = blank(32, 48);
  for (let y = 0; y < 48; y++) {
    const half = 2 + (y / 47) * 14;
    for (let x = 0; x < 32; x++) {
      const d = Math.abs(x - 15.5) / half;
      if (d > 1) continue;
      const a = Math.round((1 - d) * 70 + 20);
      if (bayer(x, y) > 0.85 && d > 0.8) continue;
      px(img, x, y, '#fff4c8', a);
    }
  }
  return img;
}

/** Camera drone with a red recording light; rotors alternate (2 frames). */
export function cameraDrone(frame: number): Image {
  const img = blank(T, 12);
  const rotor = frame === 0 ? ['kkkk....kkkk', '..kk....kk..'] : ['.kk......kk.', 'kkkk....kkkk'];
  art(img, 2, 0, rotor, { k: '#5a5e66' });
  art(img, 2, 2, ['..kkkkkkkk..', '.kMMMMMMMMk.', 'kMMLLMMMRMMk', 'kMMLLMMMMMMk', '.kMMMMMMMMk.', '..kkkkkkkk..', '....k..k....'],
    { k: OUT, M: '#8a9098', L: '#4fe8ff', R: frame === 0 ? '#ff3030' : '#801818' });
  return img;
}

/** «EN DIRECTO» sign: red light box with the pixel font, lit / dimmed (2 frames). */
export function liveSign(on: boolean): Image {
  const text = 'EN DIRECTO';
  const w = textWidth(text) + 8, h = 11;
  const img = blank(w, h);
  fill(img, 0, 0, w, h, OUT);
  fill(img, 1, 1, w - 2, h - 2, on ? '#c0141e' : '#5a0e14');
  drawText(img, text, 4, 3, hexToRgb(on ? '#fff4e8' : '#a87070'));
  if (on) for (let x = 2; x < w - 2; x += 3) px(img, x, 1, '#ff6a50');
  return img;
}

/** Shopping cart (Hipermercado and props in general). */
export function cart(): Image {
  const img = blank(T, T);
  art(img, 0, 2, [
    'kk..............',
    '.k..............',
    '.kkkkkkkkkkkkkk.',
    '.kMkMkMkMkMkMMk.',
    '.kkkkkkkkkkkkkk.',
    '..kMkMkMkMkMMk..',
    '..kkkkkkkkkkkk..',
    '...kMkMkMkMMk...',
    '...kkkkkkkkkk...',
    '...k........k...',
    '..kRk......kRk..',
    '...k........k...',
  ], { k: '#3a3e46', M: '#c0c6ce', R: '#e0302a' });
  return img;
}

/** Lighting rig: a truss with three lamps (hangs from the ceiling, 48x10). */
export function lightingRig(frame: number): Image {
  const img = blank(48, 10);
  fill(img, 0, 0, 48, 1, OUT);
  fill(img, 0, 3, 48, 1, OUT);
  for (let x = 0; x < 48; x += 4) (line(img, x, 0, x + 3, 3, '#8a9098'), px(img, x, 1, '#c0c6ce'));
  fill(img, 0, 1, 48, 1, '#5a5e66');
  const lamps = ['#ff4fa0', '#4fe8ff', '#ffe04f'];
  [8, 22, 36].forEach((x, i) => {
    art(img, x, 4, ['kkkk', 'kMMk', 'kLLk', '.kk.'], { k: OUT, M: '#5a5e66', L: (frame + i) % 3 === 0 ? '#ffffff' : lamps[i]! });
  });
  return img;
}

// --- Surfaces (16x16 overlays) ------------------------------------------------------------------

/** Forms scattered on the floor: the Funcionario's expedientes. */
export function expedientes(burning: number | null): Image {
  const img = blank(T, T);
  const r = rng(301);
  for (let n = 0; n < 6; n++) {
    const x = Math.floor(r() * 11), y = Math.floor(r() * 11), w = 5, h = 4;
    fill(img, x, y, w, h, n % 2 ? '#f4f0e0' : '#e8e0c8');
    fill(img, x, y + h, w, 1, '#a89e88');
    line(img, x + 1, y + 1, x + 3, y + 1, '#7a8aa0');
    line(img, x + 1, y + 2, x + 3, y + 2, '#7a8aa0');
    if (n === 2) px(img, x + 3, y + 3, '#c0141e');
  }
  if (burning !== null) {
    const f = burning;
    const n = valueNoise(310 + f, 16, 4);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      if (!img.data[i + 3]) continue;
      const v = n(x, y + f);
      if (v > 0.62) px(img, x, y, '#ffb030');
      else if (v > 0.5) px(img, x, y, '#e05a20');
      else if (v < 0.25) px(img, x, y, '#3a2a20');
    }
    const tongues = [[2, 6], [8, 3], [12, 8]];
    tongues.forEach(([tx, ty], k) => {
      const h = 3 + ((f + k) % 3);
      for (let i = 0; i < h; i++) {
        px(img, tx! + ((i + f + k) % 2), ty! + 4 - i, i === h - 1 ? '#fff0a0' : i > h / 2 ? '#ffd040' : '#ff7a20');
      }
    });
  }
  return img;
}

/** A spill of glass marbles in party colours. */
export function marbles(): Image {
  const img = blank(T, T);
  const r = rng(320);
  const cols = ['#e0302a', '#3a8fd9', '#40c060', '#ffe04f', '#b45cff', '#ff7a1a'];
  for (let n = 0; n < 11; n++) {
    const x = 1 + Math.floor(r() * 13), y = 1 + Math.floor(r() * 13);
    const c = cols[n % cols.length]!;
    art(img, x, y, ['.k.', 'kck', '.k.'], { k: OUT, c });
    px(img, x + 1, y + 1, c);
    px(img, x, y, '#ffffff');
  }
  return img;
}

/** A tangle of net. */
export function net(): Image {
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if ((x + y) % 5 === 0 || (x - y + 20) % 5 === 0) px(img, x, y, '#c8b088', 230);
  }
  for (const [x, y] of [[2, 2], [7, 2], [12, 2], [4, 9], [9, 9], [14, 9]]) px(img, x!, y!, '#7a5a30');
  return img;
}

/** Bubbling green toxic sludge (4 frames). */
export function toxic(frame: number): Image {
  const img = blank(T, T);
  const n = valueNoise(330, 16, 4);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = Math.min(x, y, T - 1 - x, T - 1 - y);
    if (d < n(x, y) * 2.4) continue;
    px(img, x, y, n(x, y) > 0.6 ? '#7ae04a' : '#4aa83a', 200);
  }
  const bubbles = [[4, 5], [10, 9], [7, 12], [12, 4]];
  bubbles.forEach(([bx, by], i) => {
    const s = (frame + i) % 4;
    if (s === 3) return;
    art(img, bx!, by! - s, s === 2 ? ['.k.', 'k.k', '.k.'] : ['k'], { k: '#c8ff9a' });
  });
  return img;
}

/** Steam / vapour cloud that blocks line of sight (4 frames drifting). */
export function steamCloud(frame: number): Image {
  const img = blank(T, T);
  const n = valueNoise(340, 16, 5);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = n(x + frame, y);
    if (v < 0.3) continue;
    px(img, x, y, v > 0.65 ? '#ffffff' : '#d8e4ec', Math.round(110 + v * 100));
  }
  return img;
}

// --- Effects ------------------------------------------------------------------------------------

/** Voltaic arc between two points, 32x16, jittering (4 frames). */
export function voltaicArc(frame: number): Image {
  const img = blank(32, 16);
  const r = rng(400 + frame);
  let y = 8;
  const pts: [number, number][] = [];
  for (let x = 1; x < 31; x++) {
    y = Math.max(2, Math.min(13, y + Math.round((r() - 0.5) * 3)));
    pts.push([x, y]);
  }
  for (const [x, yy] of pts) (px(img, x, yy - 1, '#4fe8ff'), px(img, x, yy + 1, '#4fe8ff'));
  for (const [x, yy] of pts) px(img, x, yy, '#ffffff');
  for (let i = 0; i < 3; i++) {
    const [bx, by] = pts[4 + Math.floor(r() * 22)]!;
    line(img, bx, by, bx + 2 + Math.floor(r() * 3), by + (r() < 0.5 ? -4 : 4), '#a0f0ff');
  }
  px(img, 0, 8, '#ffe04f');
  px(img, 31, 8, '#ffe04f');
  return img;
}

/**
 * The Ingeniero's «G» waves: concentric signal rings that grow with the level.
 * 5G: a tiny ring that droops and fizzles; 10G: a screen-wide blast (the client may scale it).
 */
export function gWave(level: number, frame: number, frames: number): Image {
  const size = level <= 5 ? 16 : level <= 7 ? 32 : level <= 9 ? 48 : 64;
  const img = blank(size, size);
  const c = size / 2 - 0.5;
  const t = (frame + 1) / frames;
  const cols = ['#4fe8ff', '#ffe04f', '#ff4fa0'];
  if (level <= 5) {
    // The sad one: one small ring that sags and a little "..." fizzle.
    const rr = 2 + t * 3;
    for (let a = Math.PI; a < Math.PI * 2; a += 0.15) px(img, c + Math.cos(a) * rr, c + Math.sin(a) * rr + t * 3, '#8a9aa8');
    if (frame === frames - 1) for (let i = 0; i < 3; i++) px(img, c - 2 + i * 2, c + 6, '#8a9aa8');
    return img;
  }
  const rings = level - 4;
  for (let k = 0; k < rings; k++) {
    const rr = ((t + k / rings) % 1) * (size / 2 - 1);
    ring(img, c, c, rr, cols[k % cols.length]!, level >= 9 ? 2 : 1, Math.round(255 * (1 - rr / (size / 2))));
  }
  if (level >= 10) {
    disc(img, c, c, 3 + t * 6, '#ffffff', 220);
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2 + t;
      line(img, c + Math.cos(ang) * 6, c + Math.sin(ang) * 6, c + Math.cos(ang) * (8 + t * 22), c + Math.sin(ang) * (8 + t * 22), '#ffe04f');
    }
  }
  return img;
}

/** A form fluttering through the air (4 frames). */
export function flyingForm(frame: number): Image {
  const img = blank(T, T);
  const shapes = [
    ['kkkkkk.', 'kWWWWWk', 'kWbbbWk', 'kWWWWWk', 'kWbbWWk', '.kkkkkk'],
    ['.kkkkk.', 'kWWWWk.', 'kWbbWWk', 'kWWWWWk', '.kWbbWk', '..kkkk.'],
    ['..kk...', '.kWWk..', 'kWbbWk.', 'kWWWWk.', '.kWWk..', '..kk...'],
    ['.kkkkk.', '.kWWWWk', 'kWWbbWk', 'kWWWWWk', 'kWbbWk.', '.kkkkk.'],
  ];
  art(img, 4, 4 + (frame % 2), shapes[frame]!, { k: '#5a5e66', W: '#f4f0e0', b: '#7a8aa0' });
  return img;
}

/** Basketball with a motion trail (4 frames, the ball spins). */
export function ballTrail(frame: number): Image {
  const img = blank(T, T);
  for (let i = 0; i < 6; i++) px(img, 1 + i, 9 - Math.floor(i / 3), '#ff9a40', 60 + i * 30);
  const seam = [['.kk.', 'k..k'], ['k..k', '.kk.'], ['.k.k', 'k.k.'], ['k.k.', '.k.k']][frame]!;
  disc(img, 11, 8, 4, '#e87a2a');
  disc(img, 10, 7, 1.5, '#ffb070');
  art(img, 9, 7, seam, { k: '#7a3a10' });
  return outline(img);
}

/** Confetti burst (5 frames): the fan's farewell. */
export function confetti(frame: number): Image {
  const img = blank(T, T);
  const r = rng(500);
  const cols = ['#ff4fa0', '#4fe8ff', '#ffe04f', '#40c060', '#ffffff'];
  for (let n = 0; n < 22; n++) {
    const a = r() * Math.PI * 2, s = 1.5 + r() * 2.5;
    const x = 8 + Math.cos(a) * s * (frame + 1), y = 8 + Math.sin(a) * s * (frame + 1) + frame * frame * 0.3;
    if (frame >= 3 && r() < 0.4) continue;
    px(img, x, y, cols[n % cols.length]!);
  }
  return img;
}

// --- HUD icons (12x12) --------------------------------------------------------------------------

const ICONS: Record<string, { rows: string[]; legend: Record<string, string> }> = {
  audiencia: { rows: ['...kkkkkk...', '..kWWWWWWk..', '.kWWkkkkWWk.', 'kWWkBBBBkWWk', 'kWkBBkkBBkWk', 'kWkBkWkkBkWk', 'kWkBBkkBBkWk', 'kWWkBBBBkWWk', '.kWWkkkkWWk.', '..kWWWWWWk..', '...kkkkkk...', '............'], legend: { k: OUT, W: '#f4f4f0', B: '#4fe8ff' } },
  reloj: { rows: ['...kkkkkk...', '..kWWWWWWk..', '.kWWWkWWWWk.', 'kWWWWkWWWWWk', 'kWWWWkWWWWWk', 'kWWWWkkkWWWk', 'kWWWWWWWWWWk', 'kWWWWWWWWWWk', '.kWWWWWWWWk.', '..kWWWWWWk..', '...kkkkkk...', '..kk....kk..'], legend: { k: OUT, W: '#ffe04f' } },
  ardiendo: { rows: ['.....k......', '....kRk.....', '...kRRk.k...', '...kRYRkRk..', '..kRYYRRRk..', '..kRYWYYRk..', '.kRYYWWYYRk.', '.kRYWWWWYRk.', '.kRYYWWYYRk.', '..kRYYYYRk..', '...kkkkkk...', '............'], legend: { k: OUT, R: '#e0302a', Y: '#ffb030', W: '#fff0a0' } },
  empapado: { rows: ['.....k......', '....kBk.....', '...kBBBk....', '..kBBWBBk...', '..kBWBBBk...', '.kBBBBBBBk..', '.kBWBBBBBk..', '.kBBBBBBBk..', '..kBBBBBk...', '...kkkkk....', '.......k.k..', '........k...'], legend: { k: OUT, B: '#3a8fd9', W: '#c8e8ff' } },
  congelado: { rows: ['.....k......', '..k..W..k...', '...kWWWk....', '.k.WkWkW.k..', '..WWWWWWW...', 'kWkWWWWWkWk.', '..WWWWWWW...', '.k.WkWkW.k..', '...kWWWk....', '..k..W..k...', '.....k......', '............'], legend: { k: '#4a7aa8', W: '#c8f0ff' } },
  electrocutado: { rows: ['......kkk...', '.....kYYk...', '....kYYk....', '...kYYk.....', '..kYYYYYk...', '...kkYYk....', '....kYk.....', '...kYk......', '..kYk.......', '..kk........', '............', '............'], legend: { k: OUT, Y: '#ffe04f' } },
  envenenado: { rows: ['...kkkkkk...', '..kGGGGGGk..', '.kGGGGGGGGk.', '.kGkkGGkkGk.', '.kGkkGGkkGk.', '.kGGGkkGGGk.', '..kGGGGGGk..', '...kGkkGk...', '...kGkkGk...', '....kkkk....', '............', '............'], legend: { k: OUT, G: '#7ae04a' } },
  tumbado: { rows: ['............', '............', '............', '............', 'kkk.........', 'kSk.kkkkkkk.', 'kSkkBBBBBBBk', 'kkkBBBBBBBBk', '...kkkkkkkk.', '............', '............', '............'], legend: { k: OUT, S: '#e8b088', B: '#e07a2a' } },
  aturdido: { rows: ['..Y......Y..', '.YYY....YYY.', '..Y..kk..Y..', '....kSSk....', '...kSSSSk...', '...kSkkSk...', '...kSSSSk...', '....kkkk....', '....Y..Y....', '...YYY.YYY..', '....Y...Y...', '............'], legend: { k: OUT, S: '#e8b088', Y: '#ffe04f' } },
  asustado: { rows: ['...kkkkkk...', '..kWWWWWWk..', '.kWWWWWWWWk.', '.kWkWWWWkWk.', '.kWWWWWWWWk.', '.kWWWkkWWWk.', '.kWWkWWkWWk.', '.kWWWkkWWWk.', '.kWkWkWkWWk.', '.kk.k.k.kk..', '............', '............'], legend: { k: OUT, W: '#f4f4f0' } },
  cegado: { rows: ['............', '............', '.kkkkkkkkkk.', 'kBBBBBBBBBBk', 'kBkkBBBBkkBk', 'kBBBBBBBBBBk', '.kkkkkkkkkk.', '............', '............', '............', '............', '............'], legend: { k: OUT, B: '#3a3e46' } },
  enredado: { rows: ['k...k...k...', '.k.k.k.k.k..', '..k...k...k.', '.k.k.k.k.k..', 'k...k...k...', '.k.k.k.k.k..', '..k...k...k.', '.k.k.k.k.k..', 'k...k...k...', '............', '............', '............'], legend: { k: '#c8b088' } },
  bailando: { rows: ['.......kk...', '.......kNk..', '.......k.Nk.', '.......k..k.', '.......k....', '....kkkk....', '...kNNNk....', '...kNNNk....', '....kkk.....', '............', '............', '............'], legend: { k: OUT, N: '#ff4fa0' } },
  mareado: { rows: ['....kkkk....', '..kk....kk..', '.k..kkkk..k.', '.k.k....k.k.', '.k.k.kk.k.k.', '.k.k.k..k.k.', '.k.k..kk..k.', '.k..k.....k.', '..k..kkkkk..', '...kk.......', '............', '............'], legend: { k: '#b45cff' } },
  escondido: { rows: ['............', '.kkkkkkkkkk.', 'kGGGGGGGGGGk', 'kGgGGGGGgGGk', 'kGGGgGGGGGGk', 'kGGGGGGgGGGk', 'kGgGGGGGGGgk', 'kGGGGgGGGGGk', '.kkkkkkkkkk.', '............', '............', '............'], legend: { k: OUT, G: '#58a04a', g: '#3a7a40' } },
  animado: { rows: ['.....kk.....', '....kYYk....', '...kYYYYk...', 'kkkYYYYYYkkk', 'kYYYYYYYYYYk', '.kYYYYYYYYk.', '..kYYYYYYk..', '..kYYkkYYk..', '.kYYk..kYYk.', '.kkk....kkk.', '............', '............'], legend: { k: OUT, Y: '#ffe04f' } },
  dormido: { rows: ['......kkkk..', '........k...', '.......k....', '......kkkk..', '..kkk.......', '....k.......', '...k........', '..kkk.......', '............', '............', '............', '............'], legend: { k: '#4fe8ff' } },
  petrificado: { rows: ['...kkkkkk...', '..kSSSSSSk..', '.kSsSSSSsSk.', '.kSSSSSSSSk.', '.kSSsSSSSSk.', '.kSSSSSsSSk.', '.kSsSSSSSSk.', '..kSSSSSSk..', '...kkkkkk...', '............', '............', '............'], legend: { k: OUT, S: '#9aa0a8', s: '#6a7078' } },
  compulsado: { rows: ['....kkkk....', '....kRRk....', '....kRRk....', '..kkkkkkkk..', '..kRRRRRRk..', '.kkkkkkkkkk.', '.kRRRRRRRRk.', '.kRWRWRWRRk.', '.kkkkkkkkkk.', '............', '............', '............'], legend: { k: OUT, R: '#c0141e', W: '#ffffff' } },
  afortunado: { rows: ['..kk...kk...', '.kGGk.kGGk..', '.kGGGkGGGk..', '..kGGGGGk...', '.kkGGGGGkk..', 'kGGGGkGGGGk.', 'kGGGk.kGGGk.', '.kGGk.kGGk..', '..kk...kk...', '.....k......', '.....k......', '............'], legend: { k: OUT, G: '#40c060' } },
};

export function hudIcons(): [string, Image][] {
  return Object.entries(ICONS).map(([id, ic]) => {
    const img = blank(12, 12);
    art(img, 0, 0, ic.rows, ic.legend);
    return [id, img];
  });
}

// --- The Presenter's arena (floor 5) ---------------------------------------------------------

/** Phase 2: a cloud of bats, each with a tiny microphone (32x24, 4 frames). */
export function batSwarm(frame: number): Image {
  const img = blank(32, 24);
  const bats: [number, number, number][] = [[6, 6, 0], [16, 3, 1], [25, 7, 2], [10, 14, 3], [21, 15, 1], [15, 10, 2], [27, 18, 0], [4, 17, 2]];
  for (const [bx, by, ph] of bats) {
    const up = (frame + ph) % 2 === 0;
    const y = by + ((frame + ph) % 4 === 1 ? 1 : 0);
    art(img, bx - 3, y - 2, up
      ? ['k.....k', 'kk...kk', '.kkPkk.', '..kRk..']
      : ['.......', 'kk...kk', 'kkkPkkk', '.k.R.k.'], { k: '#2a1e3a', P: '#5a3a7a', R: '#ff3040' });
    px(img, bx + 2, y + 2, '#c0c6ce');
    px(img, bx + 2, y + 3, '#5a5e66');
  }
  return img;
}

/** Contestant podium (16x20): coloured front with the player light and a buzzer. */
export function podium(colour: string, lit: boolean): Image {
  const img = blank(T, 20);
  fill(img, 1, 4, 14, 16, '#2a2040');
  fill(img, 2, 5, 12, 2, '#c0c6ce');
  fill(img, 3, 8, 10, 9, colour);
  fill(img, 3, 8, 10, 1, '#ffffff');
  art(img, 6, 10, ['kkkk', 'k..k', 'kkkk'], { k: lit ? '#ffffff' : '#1e1c24' });
  art(img, 6, 0, ['.kk.', 'kRRk', 'kkkk', '.kk.'], { k: OUT, R: lit ? '#ff4040' : '#a02020' });
  return outline(img);
}

/** The giant question board (48x32): a question line and three coloured answers; frame 1-3 lights one. */
export function questionBoard(frame: number): Image {
  const img = blank(48, 32);
  fill(img, 0, 0, 48, 32, OUT);
  fill(img, 1, 1, 46, 30, '#2a2048');
  for (let x = 2; x < 46; x += 2) (px(img, x, 1, frame % 2 ? '#ffe04f' : '#ff4fa0'), px(img, x + 1, 30, frame % 2 ? '#ff4fa0' : '#ffe04f'));
  fill(img, 4, 4, 40, 7, '#4a3a8a');
  drawText(img, '¿...?', 24 - Math.floor(textWidth('¿...?') / 2), 5, hexToRgb('#ffffff'));
  ['#e0302a', '#3a8fd9', '#40c060'].forEach((c, i) => {
    const y = 13 + i * 6;
    fill(img, 4, y, 40, 5, '#1e1430');
    fill(img, 4, y, 5, 5, c);
    drawText(img, 'ABC'[i]!, 5, y, hexToRgb('#ffffff'));
    if (frame === i + 1) fill(img, 10, y + 1, 33, 3, c, 160);
  });
  return img;
}

/** Bleachers seen from above with the live audience (not walkable). */
export function bleachers(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++) fill(img, 0, y, T, 1, y % 4 === 3 ? '#14101e' : '#2a2040');
  for (let row = 0; row < 4; row++) {
    for (let x = 1; x < T; x += 4) {
      const c = ['#ff4fa0', '#4fe8ff', '#ffe04f', '#7ae04a', '#b45cff'][Math.floor(r() * 5)]!;
      px(img, x + Math.floor(r() * 2), row * 4, c);
      px(img, x + Math.floor(r() * 2), row * 4 + 1, '#140c20');
    }
  }
  return img;
}

/** Answer floor tile: a coloured glass panel, unlit (dithered) or lit. */
export function answerTile(colour: string, lit: boolean): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, '#14101e');
  fill(img, 1, 1, 14, 14, colour);
  if (!lit) for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if ((x + y) % 2) px(img, x, y, '#14101e');
  fill(img, 2, 2, 12, 1, lit ? '#ffffff' : '#5a5a6a');
  fill(img, 2, 2, 1, 12, lit ? '#ffffff' : '#5a5a6a');
  return img;
}

/** An opened trapdoor in the stage floor. */
export function trapdoorOpen(): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, '#14101e');
  fill(img, 1, 1, 14, 14, '#050308');
  fill(img, 1, 1, 14, 2, '#2a2040');
  fill(img, 1, 13, 14, 2, '#5a4488');
  return img;
}

/** Glossy black studio floor with gaffer tape marks. */
export function studioFloor(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, '#1a1626');
  for (let i = 0; i < 6; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), '#2a2440');
  line(img, 0, 15, 15, 0, '#221e32');
  if (r() < 0.5) (fill(img, 3, 6, 5, 1, '#ffe04f'), fill(img, 3, 6, 1, 4, '#ffe04f'));
  return img;
}

// --- Floor 2: Hipermercado Eterno ---------------------------------------------------------------

/** Supermarket linoleum: big pale tiles with speckles and a scuff. */
export function hyperFloor(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, '#e4e6e8');
  for (let i = 0; i < 14; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), r() < 0.5 ? '#c8ccd0' : '#a8b0b8');
  fill(img, 0, 0, T, 1, '#c0c4c8');
  fill(img, 0, 0, 1, T, '#c0c4c8');
  fill(img, 8, 0, 1, T, '#d0d4d8');
  fill(img, 0, 8, T, 1, '#d0d4d8');
  if (r() < 0.4) line(img, 3, 11, 7, 12, '#9aa0a8');
  return img;
}

/** Aisle floor with a yellow «OFERTA» arrow sticker. */
export function saleAisle(): Image {
  const img = hyperFloor(77);
  art(img, 3, 3, ['...k......', '...kk.....', 'kkkkYk....', 'kYYYYYk...', 'kYYYYYYk..', 'kYYYYYk...', 'kkkkYk....', '...kk.....', '...k......'], { k: '#c08a10', Y: '#ffe04f' });
  return img;
}

/** A gondola shelf seen from above: metal top with rows of product boxes. */
export function shelfTop(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, '#8a9098');
  for (let row = 0; row < 3; row++) {
    let x = 1;
    while (x < 15) {
      const w = 2 + Math.floor(r() * 3);
      const c = ['#e0302a', '#3a8fd9', '#40c060', '#ffe04f', '#ff7a1a', '#f4f4f0'][Math.floor(r() * 6)]!;
      fill(img, x, 1 + row * 5, Math.min(w, 15 - x), 4, c);
      fill(img, x, 1 + row * 5, Math.min(w, 15 - x), 1, '#ffffff');
      x += w + 1;
    }
  }
  fill(img, 0, T - 2, T, 2, '#5a5e66');
  return img;
}

/** Front of a shelf: three shelves of boxes, bottles and price strips. */
export function shelfFace(): Image {
  const img = blank(T, T);
  const r = rng(88);
  fill(img, 0, 0, T, T, '#5a5e66');
  for (let s = 0; s < 3; s++) {
    const y = s * 5 + 1;
    let x = 1;
    while (x < 15) {
      const bottle = r() < 0.4;
      const c = ['#e0302a', '#3a8fd9', '#40c060', '#ffe04f', '#ff7a1a', '#b45cff'][Math.floor(r() * 6)]!;
      if (bottle) (fill(img, x, y + 1, 1, 3, c), px(img, x, y, '#f4f4f0'), (x += 2));
      else (fill(img, x, y, 2, 4, c), px(img, x, y, '#ffffff'), (x += 3));
    }
    fill(img, 0, y + 4, T, 1, '#c0c6ce');
    px(img, 3 + s * 4, y + 4, '#ffe04f');
  }
  return img;
}

/** Checkout conveyor belt: black rubber with chevrons running east. */
export function conveyor(frame: number): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, '#8a9098');
  fill(img, 0, 2, T, 12, '#26262c');
  for (let x = -4; x < T; x += 5) {
    const o = x + frame;
    for (let i = 0; i < 4; i++) (px(img, o + i, 4 + i, '#4a4a54'), px(img, o + i, 11 - i, '#4a4a54'));
  }
  fill(img, 0, 2, T, 1, '#c0c6ce');
  fill(img, 0, 13, T, 1, '#5a5e66');
  return img;
}

// --- Floor 3: La Verbena Sin Fin ----------------------------------------------------------------

/** Village square cobbles with confetti and streamers from the fiesta. */
export function fiestaSquare(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, '#7a6650');
  for (let row = 0; row < 4; row++) {
    let x = row % 2 ? -2 : 0;
    while (x < T) {
      const w = 3 + Math.floor(r() * 2);
      fill(img, (x + T) % T, row * 4, Math.min(w, T - ((x + T) % T)), 3, r() < 0.5 ? '#b89a78' : '#a88a68');
      px(img, (x + T) % T, row * 4, '#d0b490');
      x += w + 1;
    }
  }
  const cols = ['#ff4fa0', '#4fe8ff', '#ffe04f', '#40c060', '#e0302a'];
  for (let i = 0; i < 7; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), cols[i % cols.length]!);
  if (r() < 0.5) line(img, 2, 12, 9, 10, '#ff4fa0');
  return img;
}

/** Orchestra stage boards with a row of bulbs along the front edge. */
export function bandStage(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, y % 4 === 3 ? '#4a2c1c' : r() < 0.1 ? '#8e5e34' : '#a8743e');
  fill(img, 0, T - 2, T, 2, '#e0302a');
  for (let x = 1; x < T; x += 3) px(img, x, T - 2, '#fff4c0');
  return img;
}

/** Stage front: red skirt with gold fringe and bulbs. */
export function bandStageFace(): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, '#a01e1e');
  for (let x = 0; x < T; x += 4) fill(img, x, 0, 1, T, '#7a1414');
  fill(img, 0, 0, T, 2, '#e8b830');
  for (let x = 1; x < T; x += 3) px(img, x, 1, '#fff4c0');
  for (let x = 0; x < T; x += 2) px(img, x, T - 1, '#e8b830');
  return img;
}

/** Village rooftops seen from above with a string of fiesta bunting across them. */
export function buntingRoof(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, y % 4 === 3 ? '#8a3020' : (x + Math.floor(y / 4) * 2) % 4 === 0 ? '#8a3020' : '#c05a34');
  const cols = ['#e0302a', '#ffe04f', '#3a8fd9', '#40c060', '#ffffff'];
  for (let x = 0; x < T; x++) {
    const y = 5 + Math.round(Math.sin(x / 3) * 1.5);
    px(img, x, y, '#2a2420');
    if (x % 3 === 0) art(img, x, y + 1, ['cc', 'c.'], { c: cols[(x / 3 + Math.floor(r() * 2)) % cols.length]! });
  }
  return img;
}

/** Whitewashed facade with a small iron balcony and a flowerpot. */
export function whiteFacade(): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, '#f0ece0');
  fill(img, 0, 0, T, 1, '#ffffff');
  fill(img, 4, 2, 8, 9, '#3a5a8a');
  fill(img, 4, 2, 8, 1, '#2a4068');
  fill(img, 3, 10, 10, 1, OUT);
  for (let x = 3; x < 13; x += 2) fill(img, x, 11, 1, 3, OUT);
  fill(img, 3, 13, 10, 1, OUT);
  art(img, 10, 8, ['.R.', 'RGR', 'kkk'], { R: '#e0302a', G: '#40a060', k: '#a8603a' });
  return img;
}

// --- Floor 4: Balneario Glaciar -----------------------------------------------------------------

/** Small light-blue pool tiles with white grout. */
export function poolTiles(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const grout = x % 4 === 0 || y % 4 === 0;
    px(img, x, y, grout ? '#e8f4f8' : r() < 0.1 ? '#8ac8e0' : '#a8d8ec');
  }
  return img;
}

/** Deep pool water: blue with drifting caustic light. */
export function poolWater(frame: number): Image {
  const img = blank(T, T);
  const n = valueNoise(500, 16, 4);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = n(x + frame, y + frame);
    px(img, x, y, v > 0.62 ? '#8ae0f0' : v > 0.45 ? '#3aa8d0' : '#2a7ab8');
  }
  return img;
}

/** Frozen spa floor: pale icy tiles with frost and cracks. */
export function icyTiles(seed: number): Image {
  const img = poolTiles(seed);
  const r = rng(seed + 1);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.round(img.data[i]! * 0.6 + 255 * 0.4);
    img.data[i + 1] = Math.round(img.data[i + 1]! * 0.6 + 255 * 0.4);
    img.data[i + 2] = Math.round(img.data[i + 2]! * 0.7 + 255 * 0.3);
  }
  let x = Math.floor(r() * 10) + 3, y = 0;
  while (y < T) (px(img, x, y, '#7ab0c8'), (x += Math.round(r() * 2 - 1)), y++);
  for (let i = 0; i < 6; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), '#ffffff');
  return img;
}

/** Snowy roof seen from above (spa wall top). */
export function snowTop(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, '#f4f8fc');
  for (let i = 0; i < 10; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), '#d0e0ec');
  fill(img, 0, T - 2, T, 2, '#a8c8dc');
  for (let x = 1; x < T; x += 4) (px(img, x, T - 1, '#e8f4f8'), px(img, x, T, '#e8f4f8'));
  return img;
}

/** Spa wall: white tiles with a blue band and icicles on top. */
export function spaWall(): Image {
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, x % 4 === 0 || y % 4 === 0 ? '#d0dce4' : '#f4f8fa');
  fill(img, 0, 8, T, 3, '#3a8fd9');
  for (let x = 1; x < T; x += 3) (px(img, x, 0, '#c8f0ff'), px(img, x, 1, '#c8f0ff'), px(img, x, 2, '#a8d8f0'));
  return img;
}
