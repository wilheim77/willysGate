/**
 * Builds Willy's event stings (clock warnings, room collapse, loot boxes, achievements,
 * «¡ELIMINADO!», boss phases, trapdoors, rivals) by layering, pitching and filtering the
 * CC0 sounds already in content/willy/public/assets/audio/sfx/ — no new downloads, every
 * source is CC0 (see CREDITS.md → Audio), so the derivatives are CC0 too.
 *
 *   node scripts/audio/build-willy-stings.mjs
 *
 * Needs ffmpeg. Each sting is a list of layers: source file, pitch (1 = unchanged; the
 * trick is asetrate, so pitch also changes speed — fine for short stings), start delay in
 * seconds, volume, optional trim (seconds) and optional lowpass (Hz).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../../content/willy/public/assets/audio/sfx/', import.meta.url));
const SRC_RATE = 192000; // the existing sfx are stored at 192 kHz
const OUT_RATE = 44100;

/** @type {Record<string, { file: string; pitch?: number; delay?: number; vol?: number; trim?: number; lowpass?: number }[]>} */
const STINGS = {
  // Collapse clock: two dings (50 %, 25 %), and an urgent triple + buzzer (10 %).
  clock_warning: [
    { file: 'gameshow_ding', pitch: 0.9, delay: 0 },
    { file: 'gameshow_ding', pitch: 0.9, delay: 0.22 },
  ],
  clock_urgent: [
    { file: 'gameshow_ding', pitch: 1.2, delay: 0 },
    { file: 'gameshow_ding', pitch: 1.2, delay: 0.14 },
    { file: 'gameshow_ding', pitch: 1.2, delay: 0.28 },
    { file: 'gameshow_buzzer', pitch: 0.85, delay: 0.5, vol: 0.7, trim: 0.35 },
  ],
  // A room shakes (grieta) and then falls (caida).
  room_crack: [
    { file: 'barrel_break', pitch: 0.5, delay: 0, lowpass: 1400 },
    { file: 'barrel_break', pitch: 0.4, delay: 0.35, lowpass: 1000, vol: 0.8 },
    { file: 'door_open', pitch: 0.6, delay: 0.1, lowpass: 700, vol: 0.5, trim: 0.9 },
  ],
  room_collapse: [
    { file: 'explosion', pitch: 0.6, delay: 0, lowpass: 1500, trim: 2.6 },
    { file: 'barrel_break', pitch: 0.45, delay: 0.5, lowpass: 900, vol: 0.9 },
    { file: 'downed_thud', pitch: 0.6, delay: 1.0, lowpass: 800, vol: 0.9 },
  ],
  // Loot boxes: a chest plus a ding; the rare ones add a rising arpeggio and applause.
  box_open: [
    { file: 'chest_open', delay: 0 },
    { file: 'gameshow_ding', pitch: 1.4, delay: 0.3, vol: 0.8 },
  ],
  box_open_rare: [
    { file: 'chest_open', delay: 0 },
    { file: 'gameshow_ding', pitch: 1.0, delay: 0.3, vol: 0.8 },
    { file: 'gameshow_ding', pitch: 1.25, delay: 0.45, vol: 0.8 },
    { file: 'gameshow_ding', pitch: 1.5, delay: 0.6, vol: 0.8 },
    { file: 'gameshow_ding', pitch: 2.0, delay: 0.75, vol: 0.9 },
    { file: 'crowd_applause', delay: 0.6, vol: 0.45, trim: 1.5 },
  ],
  achievement: [
    { file: 'gameshow_ding', pitch: 1.0, delay: 0 },
    { file: 'gameshow_ding', pitch: 1.25, delay: 0.12 },
    { file: 'gameshow_ding', pitch: 1.5, delay: 0.24 },
    { file: 'tv_jingle', pitch: 1.1, delay: 0.3, vol: 0.6 },
    { file: 'crowd_applause', delay: 0.3, vol: 0.4, trim: 1.2 },
  ],
  // «¡ELIMINADO!»: a buzzer, a thud, and a descending TV jingle.
  eliminated: [
    { file: 'gameshow_buzzer', pitch: 1.0, delay: 0, vol: 0.8 },
    { file: 'downed_thud', delay: 0.15 },
    { file: 'tv_jingle', pitch: 0.7, delay: 0.45, vol: 0.7 },
  ],
  // The presenter's boss phases: thunder, a heavy hit and a low jingle.
  boss_phase: [
    { file: 'spell_thunder', pitch: 0.8, delay: 0, trim: 1.1 },
    { file: 'crit_hit', pitch: 0.7, delay: 0.1 },
    { file: 'tv_jingle', pitch: 0.65, delay: 0.5, vol: 0.8 },
  ],
  // A stage trapdoor: latch, drop and landing.
  trapdoor: [
    { file: 'trap_click', delay: 0 },
    { file: 'lever_pull', pitch: 0.7, delay: 0.1 },
    { file: 'map_whoosh', pitch: 0.55, delay: 0.3, vol: 0.9 },
    { file: 'downed_thud', pitch: 0.8, delay: 0.55, vol: 0.8 },
  ],
  // A rival shows up: a sour jingle, a blade and the crowd's «oooh».
  rival: [
    { file: 'tv_jingle', pitch: 0.75, delay: 0 },
    { file: 'hit_slash', pitch: 0.8, delay: 0.35 },
    { file: 'crowd_boo', delay: 0.3, vol: 0.5, trim: 1.2 },
  ],
};

function build(name, layers) {
  const args = ['-y', '-v', 'error'];
  for (const l of layers) args.push('-i', `${DIR}${l.file}.ogg`);
  const chains = layers.map((l, i) => {
    const f = [];
    if (l.pitch && l.pitch !== 1) f.push(`asetrate=${Math.round(SRC_RATE * l.pitch)}`);
    f.push(`aresample=${OUT_RATE}`, 'aformat=channel_layouts=stereo');
    if (l.trim) f.push(`atrim=0:${l.trim}`);
    if (l.lowpass) f.push(`lowpass=f=${l.lowpass}`);
    if (l.vol && l.vol !== 1) f.push(`volume=${l.vol}`);
    if (l.delay) f.push(`adelay=${Math.round(l.delay * 1000)}|${Math.round(l.delay * 1000)}`);
    return `[${i}:a]${f.join(',')}[a${i}]`;
  });
  const mix = `${layers.map((_, i) => `[a${i}]`).join('')}amix=inputs=${layers.length}:normalize=0:duration=longest,alimiter=limit=0.95[out]`;
  args.push('-filter_complex', `${chains.join(';')};${mix}`, '-map', '[out]', '-c:a', 'libvorbis', '-q:a', '4', '-ar', String(OUT_RATE), `${DIR}${name}.ogg`);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  console.log('built', name);
}

for (const [name, layers] of Object.entries(STINGS)) build(name, layers);
