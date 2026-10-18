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
/** Snow on the spa's roofs: seamless, with the diagonal hatch that marks solid ground you can't
 *  stand on (no per-tile edge, which striped big masses like paving). */
export function snowTop(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, '#f4f8fc');
  for (let i = 0; i < 10; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), '#d0e0ec');
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x + y) % 4 === 0) px(img, x, y, '#b8d0e0');
  return img;
}

/** Elite aura (16x8, under the feet): a golden ring with sparkles running round it. */
export function eliteAura(frame: number): Image {
  const img = blank(T, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < T; x++) {
    const d = Math.hypot((x - 7.5) / 7.2, (y - 4) / 3.4);
    if (d > 1.05 || d < 0.72) continue;
    px(img, x, y, d > 0.92 ? '#a87a10' : '#ffc440', 220);
  }
  for (let k = 0; k < 3; k++) {
    const a = ((frame + k * 4 / 3) / 4) * Math.PI * 2;
    px(img, Math.round(7.5 + Math.cos(a) * 6.5), Math.round(4 + Math.sin(a) * 3), '#fff4c0');
  }
  return img;
}

/** Stair face for walkable one-level steps (Willy's palette): treads every 3 rows, lit nose. */
export function stairFace(pal: [string, string, string, string]): Image {
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const step = y % 3;
    px(img, x, y, pal[step === 0 ? 3 : step === 1 ? 2 : 0]!);
    if (step === 1 && x % 8 === 0) px(img, x, y, pal[1]!);
  }
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

// --- Biome props (object sprites, standing on a tile) ---------------------------------------------

const PRODUCTS = ['#e0302a', '#3a8fd9', '#40c060', '#ffe04f', '#ff7a1a', '#b45cff', '#f4f4f0'];

/** Free-standing supermarket shelf (16x24): three stocked shelves; broken: tipped with stock spilled. */
export function shelfUnit(broken: boolean): Image {
  const img = blank(T, 24);
  const r = rng(broken ? 601 : 600);
  if (broken) {
    fill(img, 1, 16, 14, 6, '#8a9098');
    for (let i = 0; i < 9; i++) fill(img, Math.floor(r() * 14), 12 + Math.floor(r() * 10), 2, 2, PRODUCTS[i % PRODUCTS.length]!);
    return outline(img);
  }
  fill(img, 1, 1, 14, 22, '#8a9098');
  fill(img, 2, 2, 12, 20, '#5a5e66');
  for (let s = 0; s < 3; s++) {
    const y = 2 + s * 7;
    let x = 2;
    while (x < 14) {
      const w = 1 + Math.floor(r() * 2);
      fill(img, x, y + 1, Math.min(w, 14 - x), 5, PRODUCTS[Math.floor(r() * PRODUCTS.length)]!);
      px(img, x, y + 1, '#ffffff');
      x += w + 1;
    }
    fill(img, 2, y + 6, 12, 1, '#c0c6ce');
    px(img, 4 + s * 3, y + 6, '#ffe04f');
  }
  return outline(img);
}

/** Checkout till (16x20): counter, register with its little screen and a receipt. */
export function checkout(): Image {
  const img = blank(T, 20);
  fill(img, 0, 10, 16, 10, '#c0c6ce');
  fill(img, 0, 10, 16, 2, '#e8ecf0');
  fill(img, 0, 13, 16, 1, '#e0302a');
  art(img, 6, 1, ['kkkkkkkk', 'kSSSSSSk', 'kSGGGGSk', 'kkkkkkkk', '.kMMMMk.', 'kMWMWMMk', 'kMMMMMMk', 'kkkkkkkk'], { k: OUT, S: '#5a5e66', G: '#40e060', M: '#8a9098', W: '#f4f4f0' });
  art(img, 2, 6, ['kWk', 'kWk', 'kWk'], { k: OUT, W: '#f4f4f0' });
  return outline(img);
}

/** Bargain bin full of jumbled sale goods with a red sign. */
export function bargainBin(): Image {
  const img = blank(T, T);
  const r = rng(610);
  fill(img, 1, 7, 14, 8, '#3a8fd9');
  fill(img, 1, 7, 14, 1, '#7ab8f0');
  for (let i = 0; i < 10; i++) fill(img, 2 + Math.floor(r() * 11), 4 + Math.floor(r() * 4), 2, 2, PRODUCTS[i % PRODUCTS.length]!);
  art(img, 9, 0, ['kkkkkk', 'kRRRRk', 'kRWWRk', 'kkkkkk', '..k...'], { k: OUT, R: '#e0302a', W: '#ffffff' });
  return outline(img);
}

/** Fiesta loudspeaker on a pole (16x24). */
export function speaker(): Image {
  const img = blank(T, 24);
  fill(img, 7, 8, 2, 16, '#5a5e66');
  art(img, 2, 0, ['kkkkkkkkkkkk', 'kGGGGGGGGGGk', 'kGkkkkkkkkGk', 'kGkWWWWWWkGk', 'kGkWkkkkWkGk', 'kGkWWWWWWkGk', 'kGkkkkkkkkGk', 'kGGGGGGGGGGk', 'kkkkkkkkkkkk'], { k: OUT, G: '#8a9098', W: '#c0c6ce' });
  return outline(img);
}

/** Fair stall (32x24): striped awning, counter with prizes. */
export function fairStall(): Image {
  const img = blank(32, 24);
  for (let x = 0; x < 32; x++) fill(img, x, 0, 1, 6, Math.floor(x / 4) % 2 ? '#f4f4f0' : '#e0302a');
  for (let x = 0; x < 32; x += 4) (px(img, x + 1, 6, '#e0302a'), px(img, x + 2, 6, '#e0302a'));
  fill(img, 1, 6, 1, 18, '#8e5e34');
  fill(img, 30, 6, 1, 18, '#8e5e34');
  fill(img, 2, 7, 28, 9, '#2a2040');
  const r = rng(620);
  for (let i = 0; i < 8; i++) art(img, 3 + i * 3, 9 + (i % 2) * 2, ['.c.', 'ccc'], { c: PRODUCTS[Math.floor(r() * PRODUCTS.length)]! });
  fill(img, 0, 16, 32, 8, '#a8743e');
  fill(img, 0, 16, 32, 1, '#d09a5a');
  drawText(img, 'TOMBOLA', 16 - Math.floor(textWidth('TOMBOLA') / 2), 18, hexToRgb('#ffe04f'));
  return outline(img);
}

/** Paper lantern on a string (prop: hangs, glows). */
export function paperLantern(frame: number): Image {
  const img = blank(T, T);
  px(img, 8, 0, OUT);
  px(img, 8, 1, OUT);
  art(img, 5, 2, ['.kkkkk.', 'kRRRRRk', 'kRYYYRk', 'kRYWYRk', 'kRYYYRk', 'kRRRRRk', '.kkkkk.', '...k...'], { k: OUT, R: frame ? '#e0302a' : '#c02020', Y: '#ffb040', W: frame ? '#fff4c0' : '#ffe04f' });
  return img;
}

/** Bunting: a string of triangular flags (prop, 32x8). */
export function bunting(): Image {
  const img = blank(32, 8);
  const cols = ['#e0302a', '#ffe04f', '#3a8fd9', '#40c060', '#ffffff'];
  for (let x = 0; x < 32; x++) px(img, x, 1 + Math.round(Math.sin(x / 5) * 1), '#2a2420');
  for (let i = 0; i < 8; i++) {
    const x = i * 4, y = 2 + Math.round(Math.sin(x / 5) * 1);
    art(img, x, y, ['ccc', '.c.'], { c: cols[i % cols.length]! });
  }
  return img;
}

/** Pool lounger (16x16), striped cushion. */
export function lounger(): Image {
  const img = blank(T, T);
  art(img, 0, 5, ['...........kkkk.', '..........kWBWk.', 'kkkkkkkkkkWBWBk.', 'kWBWBWBWBWBWBWk.', 'kkkkkkkkkkkkkkk.', '.kk.........kk..', '.kk.........kk..'], { k: '#5a5e66', W: '#f4f4f0', B: '#3a8fd9' });
  return outline(img);
}

/** Pool ladder (prop on the pool edge): two chrome rails and steps going down. */
export function poolLadder(): Image {
  const img = blank(T, T);
  art(img, 3, 0, ['kk......kk', 'kCk....kCk', '.kCk..kCk.', '.kCCCCCCk.', '..kC..Ck..', '..kCCCCk..', '..kC..Ck..', '..kCCCCk..', '..kC..Ck..'], { k: '#5a5e66', C: '#e0e8f0' });
  return img;
}

/** Sauna door (wall prop, 16x24): pine boards, a steamed porthole and a thermometer. */
export function saunaDoor(frame: number): Image {
  const img = blank(T, 24);
  fill(img, 1, 1, 14, 23, '#c89a5a');
  for (let x = 1; x < 15; x += 3) fill(img, x, 1, 1, 23, '#a07040');
  art(img, 4, 4, ['.kkkkk.', 'kSSSSSk', 'kSWSSSk', 'kSSSSWk', 'kSSSSSk', '.kkkkk.'], { k: OUT, S: '#e8eef2', W: '#ffffff' });
  fill(img, 11, 12, 2, 2, '#e8b830');
  art(img, 2, 12, ['k', 'R', 'R', 'R', 'k'], { k: OUT, R: '#e0302a' });
  for (let i = 0; i < 3; i++) px(img, 5 + i * 2, 2 - ((frame + i) % 2), '#f4f4f0');
  return outline(img);
}

/** Inflatable swim ring (16x16). */
export function swimRing(): Image {
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = Math.hypot(x - 7.5, (y - 9) * 1.4);
    if (d < 7 && d > 3) px(img, x, y, Math.floor(Math.atan2(y - 9, x - 7.5) / (Math.PI / 4)) % 2 ? '#e0302a' : '#f4f4f0');
  }
  return outline(img);
}

/** Parasol (16x28): pole and a striped canopy. */
export function parasol(): Image {
  const img = blank(T, 28);
  fill(img, 7, 6, 2, 22, '#c0c6ce');
  for (let y = 0; y < 7; y++) {
    const half = 2 + y;
    for (let x = 8 - half; x < 8 + half; x++) px(img, x, y, Math.floor((x + 16) / 3) % 2 ? '#ffe04f' : '#3a8fd9');
  }
  return outline(img);
}

/** Studio camera on a pedestal (16x24) with its tally light. */
export function studioCamera(on: boolean): Image {
  const img = blank(T, 24);
  art(img, 1, 2, ['kkkkkkkkkk....', 'kMMMMMMMMkkkk.', 'kMSSSMMMMkLLk.', 'kMSSSMMMMkLLk.', 'kMMMMMMMMkkkk.', 'kkkkkkkkkk....', '....kk........'], { k: OUT, M: '#3a3e46', S: '#5a6a8a', L: '#4fe8ff' });
  px(img, 3, 1, on ? '#ff3030' : '#5a1818');
  fill(img, 5, 9, 2, 10, '#5a5e66');
  art(img, 0, 18, ['..kkkkkkkk..', '.kMMMMMMMMk.', 'kMk......kMk', 'kk........kk'], { k: OUT, M: '#5a5e66' });
  return outline(img);
}

/** Floor monitor (stage wedge speaker). */
export function floorMonitor(): Image {
  const img = blank(T, T);
  art(img, 1, 6, ['....kkkkkkkk..', '..kkGGGGGGGGk.', 'kkGGWWWWWWGGk.', 'kGGWkkkkkkWGk.', 'kGGWWWWWWWWGk.', 'kkkkkkkkkkkkk.'], { k: OUT, G: '#2a2a30', W: '#5a5e66' });
  return img;
}

/** Cable run on the studio floor (prop decal): taped bundle with a connector. */
export function cables(): Image {
  const img = blank(T, T);
  for (let x = 0; x < T; x++) {
    px(img, x, 7 + Math.round(Math.sin(x / 2.5)), '#1e1c24');
    px(img, x, 9 + Math.round(Math.cos(x / 3)), '#e0302a');
    px(img, x, 8, '#3a3e46');
  }
  fill(img, 6, 6, 3, 5, '#ffe04f');
  art(img, 12, 7, ['kk', 'kM', 'kk'], { k: OUT, M: '#c0c6ce' });
  return img;
}

/** Clapperboard. */
export function clapperboard(): Image {
  const img = blank(T, T);
  art(img, 2, 3, ['kkkkkkkkkkk.', 'kWkWkWkWkWk.', 'kkkkkkkkkkk.', 'kSSSSSSSSSk.', 'kSWWWSSWWSk.', 'kSSSSSSSSSk.', 'kSWWSWWWSSk.', 'kSSSSSSSSSk.', 'kkkkkkkkkkk.'], { k: OUT, W: '#f4f4f0', S: '#2a2a30' });
  return img;
}

/** Director's chair with «PRODUCCIÓN» on the back. */
export function directorChair(): Image {
  const img = blank(T, 20);
  fill(img, 2, 2, 12, 5, '#1e1c24');
  drawText(img, 'PROD', 3, 3, hexToRgb('#ffe04f'));
  fill(img, 2, 10, 12, 2, '#1e1c24');
  for (const x of [2, 13]) (fill(img, x, 2, 1, 18, '#a8743e'));
  line(img, 3, 12, 12, 19, '#a8743e');
  line(img, 12, 12, 3, 19, '#a8743e');
  return outline(img);
}

// --- Signature ability FX ---------------------------------------------------------------------

/** Butane bottle blowing up (48x48): blue gas core, orange fireball, bottle shards and the valve cap flying off. */
export function bottleBlast(): Image[] {
  const S = 48, c = 23.5;
  const ramp = ['#3a1a10', '#b04a1e', '#e86a2a', '#ffb040', '#4fa8ff', '#e8f4ff'];
  return Array.from({ length: 7 }, (_, f) => {
    const img = blank(S, S);
    const p = (f + 1) / 7, R = 22 * Math.min(1, 0.3 + p * 1.1);
    const hollow = p > 0.55 ? (p - 0.55) * 1.7 : 0, fade = p > 0.65 ? (p - 0.65) * 2.4 : 0;
    const n = valueNoise(880 + f, 48, 8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = (Math.hypot(x - c, (y - c) * 1.1) / R) * (0.85 + 0.3 * n(x, y));
      if (d > 1 || d < hollow || (fade && bayer(x, y) < fade)) continue;
      const t = 1 - d;
      const k = f < 2 && t > 0.55 ? 5 : t > 0.6 ? 4 : t > 0.4 ? 3 : t > 0.2 ? 2 : t > 0.08 ? 1 : 0;
      px(img, x, y, p > 0.6 && d > 0.7 ? '#5a5254' : ramp[k]!);
    }
    const r = rng(890);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = 6 + p * 22 + r() * 3;
      const x = Math.round(c + Math.cos(a) * d), y = Math.round(c + Math.sin(a) * d - p * 4);
      if (f < 6) fill(img, x, y, 2, 2, i % 3 ? '#e86a2a' : '#b04a1e');
    }
    if (f < 6) {
      const x = Math.round(c + 4 + p * 14), y = Math.round(c - 6 - p * 18);
      fill(img, x, y, 3, 2, '#8a8f96');
      px(img, x + 1, y - 1, OUT);
    }
    return img;
  });
}

/** A thrown butane bottle tumbling through the air (16x16, 4 frames of rotation). */
export function flyingBottle(frame: number): Image {
  const img = blank(T, T);
  const shapes = [
    ['..kk..', '.kggk.', 'kAAAAk', 'kAWWAk', 'kAAAAk', 'kaaaak', 'kAAAAk', '.kkkk.'],
    ['....kk..', '...kggk.', '..kAAAk.', '.kAWAAk.', 'kAAAAk..', 'kaaak...', '.kkk....'],
    ['.kkkkkk.', 'kAaAAAAk', 'kAaWWAAkgk', 'kAaAAAAk', '.kkkkkk.'],
    ['.kkk....', 'kaaak...', 'kAAAAk..', '.kAWAAk.', '..kAAAk.', '...kggk.', '....kk..'],
  ];
  const s = shapes[frame % 4]!;
  art(img, Math.floor((T - s[0]!.length) / 2), Math.floor((T - s.length) / 2), s, { k: OUT, A: '#e86a2a', a: '#b04a1e', W: '#f4ece0', g: '#8a8f96' });
  return img;
}

/** Slam dunk impact (32x16, at the feet): a shock ring on the floor, dust and orange stars. */
export function dunkImpact(): Image[] {
  return Array.from({ length: 6 }, (_, f) => {
    const img = blank(32, 16);
    const p = (f + 1) / 6, rx = 4 + p * 11, ry = 2 + p * 4;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot((x - 15.5) / rx, (y - 11) / ry);
      if (Math.abs(d - 1) > 0.18 || bayer(x, y) < (f > 3 ? (f - 3) * 0.35 : 0)) continue;
      px(img, x, y, d < 1 ? '#fff0a0' : '#e8b830');
    }
    const r = rng(900);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + r() * Math.PI, d = rx * (0.8 + r() * 0.3);
      const x = Math.round(15.5 + Math.cos(a) * d), y = Math.round(11 + Math.sin(a) * ry * 1.4 - p * 3);
      if (f < 5) {
        px(img, x, y, '#e87a2a');
        px(img, x + 1, y, '#ffb040');
        px(img, x, y - 1, '#ffb040');
      }
    }
    if (f < 3) for (let i = 0; i < 8; i++) px(img, 8 + i * 2, 13 + (i % 2), '#b0a89e');
    return img;
  });
}

/** Paperwork storm over the target (16x24): forms flutter down around it (Vuelva usted mañana). */
export function paperStorm(frame: number): Image {
  const img = blank(T, 24);
  const sheets = [[2, 0], [10, 3], [5, 7], [12, 10], [1, 12], [8, 15]];
  sheets.forEach(([x0, y0], i) => {
    const y = y0! + frame * 2 - (i % 2), x = x0! + Math.round(Math.sin(frame + i) * 1.5);
    if (y < 0 || y > 20) return;
    const tilt = (frame + i) % 2;
    art(img, x, y, tilt ? ['kkkk', 'kWWk', 'kWlk', 'kkkk'] : ['kkk.', 'kWWk', 'kWlk', '.kkk'], { k: '#5a5e66', W: '#f4f4f0', l: '#3a6ab0' });
  });
  return img;
}

/** Official rubber stamp (16x16): comes down, thumps, leaves a red mark. */
export function stampThump(frame: number): Image {
  const img = blank(T, T);
  const y = [0, 3, 5, 5, 5][frame]!;
  if (frame < 3) art(img, 5, y, ['.kk.', '.kTk', '.kTk', 'kkkkk', 'kXXXk', 'kkkkk'], { k: OUT, T: '#a07040', X: '#d02020' });
  if (frame >= 2) {
    art(img, 3, 11, ['XXXXXXXXX', 'X.......X', 'X.XX.XX.X', 'X.......X', 'XXXXXXXXX'], { X: frame === 4 ? '#a01818' : '#e02a2a' });
    if (frame === 2) for (const [dx, dy] of [[1, 10], [13, 10], [0, 14], [14, 14]]) px(img, dx!, dy!, '#e02a2a');
  }
  return img;
}

/** Electric impact for the voltaic arc (16x16): forking sparks around the target. */
export function zapImpact(frame: number): Image {
  const img = blank(T, T);
  const r = rng(920 + frame * 7);
  const cols = ['#ffffff', '#4fe8ff', '#a0e8ff'];
  if (frame < 4) for (let a = 0; a < 4; a++) {
    let x = 7.5, y = 7.5;
    const ang = r() * Math.PI * 2;
    for (let s = 0; s < 6; s++) {
      x += Math.cos(ang) * 1.1 + (r() - 0.5) * 1.6;
      y += Math.sin(ang) * 1.1 + (r() - 0.5) * 1.6;
      px(img, Math.round(x), Math.round(y), cols[s < 2 ? 0 : s < 4 ? 1 : 2]!);
    }
  }
  for (let i = 0; i < 3; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), '#4fe8ff');
  return img;
}

// --- Floor-collapse clock (derrumbe): warning cracks, the sunken pit, dust and falling debris ---

/**
 * Cracks spreading across the floor during the 1-round warning before a room falls (`grieta`
 * surface, over any terrain). Dark fissures from an off-centre point with a pulsing amber glow
 * so it reads as a hazard rather than a stain, even over busy floors. 3 frames, looping.
 */
export function crackedFloor(frame: number): Image {
  const img = blank(T, T);
  const glowA = [140, 255, 190][frame % 3]!;
  const segs: [number, number, number, number][] = [
    [6, 5, 1, 1], [6, 5, 13, 2], [6, 5, 3, 13], [6, 5, 14, 9], [6, 5, 9, 14],
  ];
  // A wide amber glow under the cracks (thick and semi-transparent) so it reads at a glance,
  // then an opaque near-black crack line on top for contrast over any floor colour.
  for (const [x0, y0, x1, y1] of segs) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]] as const) line(img, x0 + dx, y0 + dy, x1 + dx, y1 + dy, '#ff9a40', Math.round(glowA * 0.55));
    line(img, x0, y0, x1, y1, '#0c080a', 255);
    line(img, x0 + 1, y0, x1 + 1, y1, '#0c080a', 170);
  }
  // Short secondary hairline cracks off the main ones.
  const r = rng(960);
  for (const [x0, y0, x1, y1] of segs) {
    const t = 0.35 + r() * 0.35, mx = x0 + (x1 - x0) * t, my = y0 + (y1 - y0) * t;
    const ang = Math.atan2(y1 - y0, x1 - x0) + (r() < 0.5 ? 1 : -1) * 1.1;
    line(img, mx, my, mx + Math.cos(ang) * 2.5, my + Math.sin(ang) * 2.5, '#0c080a', 220);
  }
  disc(img, 6, 5, 1.4, '#ffe6b0', glowA);
  return img;
}

/** Sunken rubble pit left where a room collapsed (`hundido` top, 16x16): unwalkable. 2 variants. */
export function sunkenPit(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, '#1c1418');
  // Jagged broken rim catching a little light at the top edge, like a hole punched in the floor.
  for (let x = 0; x < T; x++) {
    const h = 1 + Math.floor(r() * 2);
    for (let y = 0; y < h; y++) px(img, x, y, y === 0 ? '#6a564e' : '#3a2c2e');
  }
  // Big broken slabs tipped into the pit: chunky and lit on one edge so they read clearly.
  const slabs: [number, number, number, number][] = [[1, 5, 4, 3], [10, 3, 4, 4], [6, 9, 5, 3], [11, 10, 3, 3], [2, 11, 3, 2]];
  slabs.forEach(([x, y, w, h]) => {
    fill(img, x, y, w, h, '#58483e');
    fill(img, x, y, w, 1, '#8a7064');
    fill(img, x, y + h - 1, w, 1, '#241a1c');
    px(img, x, y, '#a08870');
  });
  // Dark cracks between the slabs so the pit still reads as a hole, not a floor.
  for (let i = 0; i < 10; i++) px(img, Math.floor(r() * T), Math.floor(r() * T), '#0e0810');
  // A couple of warning embers glowing at the bottom, varied by seed.
  if (r() < 0.7) px(img, 6 + Math.floor(r() * 3), 9 + Math.floor(r() * 3), '#ff7a1a', 190);
  if (r() < 0.5) px(img, 5 + Math.floor(r() * 4), 12, '#ff9a40', 130);
  return img;
}

/** Face below the sunken pit: sheared concrete and bent rebar where the floor gave way. */
export function sunkenPitFace(): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, '#2a2024');
  const r = rng(970);
  for (let x = 0; x < T; x++) {
    const h = Math.floor(r() * 4);
    for (let y = 0; y < h; y++) px(img, x, y, '#150f14');
  }
  for (let x = 1; x < T; x += 4) {
    const wobble = Math.floor(r() * 2);
    line(img, x + wobble, 3, x, T - 1, '#59494a');
  }
  for (let i = 0; i < 3; i++) px(img, 2 + i * 5, 10 + (i % 2), '#8a7068');
  fill(img, 0, T - 2, T, 2, '#0e0810');
  return img;
}

/**
 * Dust cloud billowing up as the room falls (`fx-polvo-derrumbe`, anchor floor, 24x20, 6 frames).
 * Bigger and warmer than the combat `fx_dust` puff so it reads as a structural event.
 */
export function collapseDust(frame: number): Image {
  const W = 24, H = 20;
  const img = blank(W, H);
  const grow = [1.5, 2.6, 3.6, 4.5, 5.2, 5.8][frame]!;
  const rise = frame * 1.3;
  const balls: [number, number, number][] = [[12, 16, 1], [6, 17, 0.75], [18, 17, 0.8], [9, 15, 0.6], [15, 15, 0.65]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let inside = false, top = false;
    for (const [bx, by, s] of balls) {
      const rad = grow * s;
      const dy = y - (by - rise);
      if ((x - bx) ** 2 + dy ** 2 <= rad * rad) {
        inside = true;
        if (dy < -rad * 0.3) top = true;
      }
    }
    if (!inside) continue;
    const dith = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y % 4]![x % 4]!;
    if (dith < [0, 0, 2, 5, 9, 13][frame]!) continue;
    px(img, x, y, top ? '#d8c4a8' : frame > 3 ? '#9a8070' : '#b89a84');
  }
  return img;
}

/**
 * Chunks of debris falling and landing (`fx-cascotes`, anchor floor, 16x24, 5 frames): a couple
 * of rocks drop from above, hit the tile and kick up chips and a small dust burst.
 */
export function fallingRubble(frame: number): Image {
  const img = blank(T, 24);
  const stones: [number, number, number][] = [[4, -2, 3], [10, 1, 2]];
  const fall = [0, 7, 14, 17, 17][frame]!;
  if (frame < 3) {
    stones.forEach(([x0, y0, size]) => {
      const y = y0 + fall;
      if (y > 17) return;
      disc(img, x0, y, size * 0.8, '#6a564e');
      px(img, x0 - 1, y - 1, '#8a7068');
      // Motion streak above it.
      for (let i = 1; i <= 3; i++) px(img, x0, y - i, '#4a3a38', 120 - i * 30);
    });
  }
  if (frame >= 2) {
    const p = (frame - 2) / 2;
    for (const [x0] of stones) {
      disc(img, x0, 18, 2 + p * 3, '#2a2024', Math.round(180 * (1 - p * 0.6)));
    }
    const r = rng(980 + frame);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + r() * Math.PI, d = 2 + p * 6;
      px(img, Math.round(7.5 + Math.cos(a) * d), Math.round(19 - r() * p * 4), r() < 0.5 ? '#8a7068' : '#5a4a48');
    }
  }
  if (frame === 4) fill(img, 2, 19, 12, 1, '#150f14');
  return img;
}

// --- Ability FX for the 21 new floor enemies (shared shapes, themed per ability by colour) -----
// A handful of generic shapes (beam, pulse ring, impact, cone, tossed bit) reused with different
// colours/marks, the same way `gWave` covers six ids. Ids and kinds per docs/ART_CATALOG.md →
// "Efectos nuevos de Willy" / fx.json.

/** A reaching beam (tentacle, lash...) that grows across 3 frames, 32x16, pointing right. */
export function reachBeam(frame: number, colour: string, glow: string): Image {
  const img = blank(32, 16);
  const len = [12, 22, 30][frame]!;
  for (let x = 1; x < len; x++) {
    const y = 8 + Math.round(Math.sin(x * 0.4) * 2);
    px(img, x, y, colour);
    px(img, x, y + 1, glow, 140);
    if (x % 4 === 0) px(img, x, y - 1, glow, 90);
  }
  if (len < 31) (px(img, len, 8, '#ffffff'), px(img, len, 7, '#ffffff', 160));
  return img;
}

/** `reachBeam` with a little mark riding along it (e.g. a question mark), 32x16, 3 frames. */
export function markedBeam(frame: number, colour: string, mark: string[]): Image {
  const img = reachBeam(frame, colour, colour);
  const spots: [number, number][] = [[7, 2], [17, 10], [25, 3]];
  const [x, y] = spots[frame % spots.length]!;
  art(img, x, y, mark, { k: colour, w: '#ffffff' });
  return img;
}

/** A pulsing AoE ring on the ground, 24x24, 4 frames: shared "ring"/"burst" landing shape. */
export function groundPulse(frame: number, colour: string, glow: string): Image {
  const S = 24;
  const img = blank(S, S);
  const c = S / 2 - 0.5;
  const rr = 2 + frame * 4.5;
  ring(img, c, c, rr, colour, 2, Math.round(255 * (1 - frame / 4)));
  if (frame === 0) disc(img, c, c, 3, glow, 200);
  return img;
}

/** A quick impact flash at the target: small ring plus radiating lines, 16x16, 3 frames. */
export function impactBurst(frame: number, colour: string): Image {
  const img = blank(T, T);
  const c = T / 2 - 0.5;
  ring(img, c, c, 2 + frame * 2.5, colour, 1, Math.round(255 * (1 - frame / 3)));
  if (frame === 0) {
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      line(img, c, c, c + Math.cos(ang) * 6, c + Math.sin(ang) * 6, colour, 160);
    }
    px(img, c, c, '#ffffff');
  }
  return img;
}

/** A soft cone washing outward (mist, light, sound), 32x32, 3 frames, pointing right. */
export function coneWash(frame: number, colour: string): Image {
  const S = 32;
  const img = blank(S, S);
  const reach = [10, 20, 28][frame]!;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dy = y - S / 2;
    if (x > reach || x < 0) continue;
    const spread = (x / reach) * S * 0.4;
    if (Math.abs(dy) > spread) continue;
    px(img, x, y, colour, Math.round(140 * (1 - x / (reach + 4))));
  }
  return img;
}

/** A small object thrown with a short motion trail, 16x16, 3 frames (drawn facing right). */
export function tossedBit(frame: number, body: (img: Image) => void): Image {
  const img = blank(T, T);
  for (let i = 1; i <= 2 + frame; i++) px(img, 7 - i, 8, '#120e14', 140 - i * 30);
  body(img);
  return img;
}

/** Tiny generic bead used as `beadFx` for self-centred bursts that barely travel (8x8, 3 frames). */
export function tinyBead(frame: number, colour: string): Image {
  const img = blank(8, 8);
  disc(img, 4, 4, 1.5 + frame * 0.3, colour, 220);
  px(img, 4, 4, '#ffffff');
  return img;
}

export function tentacleLash(frame: number): Image { return reachBeam(frame, '#8a3ad0', '#b45cff'); }
export function barnacleShot(frame: number): Image { return tossedBit(frame, (img) => art(img, 5, 6, ['.kk.', 'kwwk', 'kwwk', '.kk.'], { k: '#5a5248', w: '#d8d0b8' })); }
export function eelZapBead(frame: number): Image { return tinyBead(frame, '#4fe8ff'); }
export function puddleShock(frame: number): Image { return groundPulse(frame, '#4fe8ff', '#a0e8ff'); }
export function restockRing(frame: number): Image { return groundPulse(frame, '#40c060', '#9affb0'); }
export function tackleHit(frame: number): Image { return impactBurst(frame, '#e0302a'); }
export function corkShot(frame: number): Image { return tossedBit(frame, (img) => art(img, 6, 6, ['kk', 'wk'], { k: '#6a4020', w: '#d8302a' })); }
export function bingoShout(frame: number): Image { return groundPulse(frame, '#ff4fa0', '#ffd0ea'); }
export function bassThump(frame: number): Image { return groundPulse(frame, '#ff9a40', '#ffe0a0'); }
export function lockHold(frame: number): Image { return impactBurst(frame, '#f4f4f0'); }
export function mudHeal(frame: number): Image { return groundPulse(frame, '#6a4a2a', '#9aa84a'); }
export function mudSlap(frame: number): Image { return tossedBit(frame, (img) => disc(img, 7, 8, 3, '#5a3e24')); }
export function trickQuestion(frame: number): Image { return markedBeam(frame, '#e0302a', ['.k.', 'kwk', '.k.', 'kwk']); }
export function makeupPuff(frame: number): Image { return groundPulse(frame, '#ff8fc8', '#ffe0f0'); }
export function clapperCall(frame: number): Image { return impactBurst(frame, '#ffe04f'); }
export function blindingCone(frame: number): Image { return coneWash(frame, '#ffffff'); }
export function perfumeCloud(frame: number): Image { return coneWash(frame, '#ff8fc8'); }
