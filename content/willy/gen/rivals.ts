import type { Entity, Vec2 } from '../../../engine';
import { createCreature } from '../../../rulesets/willy';
import generator from '../data/rival-generator.json';
import legendaries from '../data/rivals.json';
import ninja from '../assets/ninja.json';
import { Gen } from './random';

/**
 * Procedural rival dungeon-crawlers (docs/willy/DESIGN.md §17), from the tables in
 * data/rival-generator.json. Everything comes from deriveSeed(runSeed, 'rival', floor, slot):
 * the state only keeps where each rival came from and what happened (systems.rivals); names, numbers and lines
 * are derived again from it.
 */

type Gender = 'm' | 'f';
type Moment = keyof typeof generator.frases;

export interface RivalProfile {
  /** Entity id, stable for the run. */
  id: string;
  genero: Gender;
  raza: string;
  nombre: string;
  apellido: string;
  apodo: string;
  lugar: string;
  oficio: string;
  oficioCorto: string;
  personalidad: string;
  coletillas: string[];
  mania: string;
  gancho: string;
  kit: string;
  comportamiento: string;
  pactoDif: number;
  paleta: string;
  aspecto: Record<string, string>;
}

/** What systems.rivals remembers of each rival in the run. */
export interface RivalRecord {
  id: string;
  /** Where it was generated: generateRival(runSeed, planta, ranura, keys of the earlier ones). */
  planta: number;
  ranura: number;
  legendario?: string;
  /** Race id, for the «Fauna local» achievement. */
  raza?: string;
  plantas: number[];
  desenlace?: 'derrotado' | 'pacto' | 'huida';
}

const rules = generator.reglas;
const MAX_RETRIES = 30;

/** The combinations that must not repeat in a run (reglas.unicidadEnPartida). */
function uniqueKeys(p: RivalProfile): string[] {
  return [`nombre:${p.nombre} ${p.apellido}`, `apodo:${p.apodo}`, `terna:${p.raza}+${p.kit}+${p.comportamiento}`, `mania:${p.mania}`, `gancho:${p.gancho}`];
}

function nickname(g: Gen, genero: Gender, lugar: string, oficioCorto: string): string {
  const a = generator.apodos;
  const tpl = g.pick(a.plantillas);
  return tpl
    .replace('{art}', a.articulo[genero])
    .replace('{adj}', g.pick(a.adjetivos[genero]))
    .replace('{lugar}', lugar)
    .replace('{oficioCorto}', oficioCorto)
    .replace('{verbo}', g.pick(a.verbos));
}

/**
 * One rival. `taken` holds the unique keys already used in this run (and the recent names
 * from the browser profile); a clash rerolls only the field that clashed.
 */
export function generateRival(runSeed: number, floor: number, slot: number, taken: ReadonlySet<string> = new Set()): RivalProfile {
  const g = Gen.of(runSeed, 'rival', floor, slot);
  const genero: Gender = g.chance(0.5) ? 'm' : 'f';
  const raza = g.weighted(generator.razas, (r) => r.peso ?? 1)!;
  const reroll = <T>(field: string, roll: (g: Gen) => T, key: (t: T) => string): T => {
    let value = roll(g);
    for (let n = 1; n <= MAX_RETRIES && taken.has(key(value)); n++) value = roll(Gen.of(runSeed, 'rival', floor, slot, field, 'reintento', n));
    return value;
  };
  const [nombre, apellido] = reroll('nombre', (r) => [r.pick(generator.nombres[genero]), r.pick(generator.apellidos)] as const, ([n, a]) => `nombre:${n} ${a}`);
  const lugar = g.pick(generator.lugares);
  const oficio = g.pick(generator.oficios);
  const oficioNombre = genero === 'f' ? oficio.nombreF : oficio.nombre;
  const oficioCorto = genero === 'f' ? oficio.cortoF : oficio.corto;
  const apodo = reroll('apodo', (r) => nickname(r, genero, lugar, oficioCorto), (a) => `apodo:${a}`);
  const personalidad = g.pick(generator.personalidades);
  const mania = reroll('mania', (r) => r.pick(generator.manias), (m) => `mania:${m}`);
  const gancho = reroll('gancho', (r) => r.pick(generator.ganchos), (h) => `gancho:${h}`);
  const [kit, comportamiento] = reroll(
    'terna',
    (r) => [r.pick(generator.kits), r.pick(generator.comportamientos)] as const,
    ([k, c]) => `terna:${raza.id}+${k.id}+${c.id}`,
  );
  const ranuras = generator.aspecto.ranuras as Record<string, string[]>;
  const aspecto = Object.fromEntries(Object.entries(ranuras).map(([slotName, options]) => [slotName, g.pick(options)]));
  return {
    id: `rival-p${floor}-${slot}`,
    genero,
    raza: raza.id,
    nombre,
    apellido,
    apodo,
    lugar,
    oficio: oficioNombre,
    oficioCorto,
    personalidad: personalidad.id,
    coletillas: personalidad.coletillas,
    mania,
    gancho,
    kit: kit.id,
    comportamiento: comportamiento.id,
    pactoDif: comportamiento.pactoDif,
    paleta: g.pick(raza.paletas),
    aspecto,
  };
}

/**
 * The generated rivals of a run, rebuilt from their records in the order they were met (each
 * one was generated avoiding the ones before it, so the order matters).
 */
export function rebuildProfiles(runSeed: number, records: readonly RivalRecord[]): Map<string, RivalProfile> {
  const out = new Map<string, RivalProfile>();
  const taken = new Set<string>();
  for (const r of records) {
    if (r.legendario) continue;
    const p = generateRival(runSeed, r.planta, r.ranura, taken);
    for (const k of uniqueKeys(p)) taken.add(k);
    out.set(r.id, p);
  }
  return out;
}

export function legendaryById(id: string): (typeof legendaries.legendarios)[number] | undefined {
  return legendaries.legendarios.find((l) => l.id === id);
}

export function rivalKeys(p: RivalProfile): string[] {
  return uniqueKeys(p);
}

/** Display name: «Txema el Breve». */
export function rivalName(p: RivalProfile): string {
  return `${p.nombre} ${p.apodo}`;
}

/**
 * How a rival grows over the season's ten floors (balance pass, BALANCE.md): health from 55 %
 * of the kit's on floor 1 to about 190 % on floor 10; to-hit and DEF from one below the kit's;
 * the damage die up a step every three floors.
 */
export function rivalScale(floor: number): { vida: number; ataque: number; def: number; pasos: number } {
  return { vida: 0.55 + 0.15 * (floor - 1), ataque: -1 + Math.floor((floor - 1) / 2), def: -1 + Math.floor((floor - 1) / 3), pasos: Math.floor((floor - 1) / 3) };
}

/**
 * Body sprite id: `<cuerpoBase>--<paleta>`, or `<cuerpoBase>-f--<paleta>` for a woman when the
 * art preset has that variant (falls back to the shared body otherwise).
 */
export function bodySprite(cuerpoBase: string, genero: Gender, paleta: string): string {
  const female = `${cuerpoBase}-f--${paleta}`;
  return genero === 'f' && female in (ninja.sprites as Record<string, unknown>) ? female : `${cuerpoBase}--${paleta}`;
}

/**
 * The rival as a creature: kit numbers scaled by floor (1-10, rivalScale) and the race's
 * attributes. `opening` picks the first line of the encounter dialogue: a fresh presentación, or
 * vueltaHuida for one who fled before and is back (docs/willy/DESIGN.md §17).
 */
export function rivalEntity(p: RivalProfile, floor: number, position: Vec2, opening: 'presentacion' | 'vueltaHuida' = 'presentacion'): Entity {
  const kit = generator.kits.find((k) => k.id === p.kit)!;
  const raza = generator.razas.find((r) => r.id === p.raza)!;
  const scale = rivalScale(floor);
  const bonus = scale.ataque;
  const dano = stepDice(kit.dano, scale.pasos);
  const attrs = raza.atributos as unknown as Record<string, number>;
  const e = createCreature({
    id: p.id,
    name: rivalName(p),
    controllerId: 'ai',
    factionId: 'rivales',
    position,
    spriteId: bodySprite(raza.cuerpoBase, p.genero, p.paleta),
    vida: Math.round(kit.vidaBase * scale.vida),
    def: kit.def + scale.def,
    ataque: kit.ataque + bonus,
    dano,
    movimiento: kit.movimiento,
    ...(kit.alcance ? { alcance: kit.alcance, distancia: true } : {}),
    fue: attrs.fue ?? 5,
    tags: [
      'rival',
      `raza:${p.raza}`,
      `kit:${p.kit}`,
      `ia:${kit.ia}`,
      `comportamiento:${p.comportamiento}`,
      `pacto:${p.pactoDif}`,
      `genero:${p.genero}`,
      ...raza.rasgos.map((t) => `rasgo:${t.id}`),
      ...Object.entries(p.aspecto).filter(([, v]) => v !== 'ninguno').map(([k, v]) => `aspecto:${k}:${v}`),
      ...dialogueTags(p, opening),
    ],
  });
  // The race's attributes for checks and saves; DEF stays the kit's (armadura absorbs AGI).
  const agi = attrs.agi ?? 0;
  return { ...e, stats: { ...e.stats, ...attrs, agi, armadura: kit.def + scale.def - 10 - Math.floor(agi / 2) } };
}

const DICE_LADDER = ['1d3', '1d4', '1d6', '1d8', '1d10', '1d12'];

function stepDice(dice: string, steps: number): string {
  const i = DICE_LADDER.indexOf(dice);
  if (i < 0 || steps <= 0) return dice;
  return DICE_LADDER[Math.min(DICE_LADDER.length - 1, i + steps)]!;
}

/**
 * One line for a moment (presentación, amenaza, pacto...). `n` picks the template and the
 * coletilla, so the caller can vary them. The full Narrador template engine (R5) will replace this.
 */
export function rivalLine(p: RivalProfile, moment: Moment, n = 0): string {
  const templates = generator.frases[moment];
  const tpl = templates[Math.abs(n) % templates.length]!;
  const raza = generator.razas.find((r) => r.id === p.raza)!;
  const vars: Record<string, string> = {
    rivalNombre: p.nombre,
    rivalApellido: p.apellido,
    rivalApodo: p.apodo,
    rivalLugar: p.lugar,
    rivalOficio: p.oficio,
    rivalRaza: raza.enFrase[p.genero],
    rivalMania: p.mania,
    rival: rivalName(p),
    coletilla: p.coletillas[Math.abs(n) % p.coletillas.length]!,
    o: p.genero === 'f' ? 'a' : 'o',
  };
  return tpl.replace(/\{(\w+)(?::(\w+))?\}/g, (whole, key: string, filter?: string) => {
    const v = vars[key];
    if (v === undefined) return whole;
    return filter === 'Mayus' ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  });
}

/** A rival's own line for the encounter dialogue (content/willy/dialogues/rival-encuentro.json), chosen deterministically from the profile so the same rival always opens the same way. */
export function openingLine(p: RivalProfile, opening: 'presentacion' | 'vueltaHuida' = 'presentacion'): string {
  const n = [...p.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return rivalLine(p, opening, n);
}

/** Tags read by the dialogue tree ($partnerTag) and the Narrador (rivalAfterCommand): the rival's
 * own lines for each beat, plus its display fields and pact DC. See docs/willy/DESIGN.md §17. */
function dialogueTags(p: RivalProfile, opening: 'presentacion' | 'vueltaHuida'): string[] {
  const raza = generator.razas.find((r) => r.id === p.raza)!;
  const n = [...p.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return [
    `rnombre:${p.nombre}`,
    `rapodo:${p.apodo}`,
    `rapellido:${p.apellido}`,
    `rlugar:${p.lugar}`,
    `roficio:${p.oficio}`,
    `rmania:${p.mania}`,
    `rraza:${raza.enFrase[p.genero]}`,
    `dlg-inicio:${openingLine(p, opening)}`,
    `dlg-amenaza:${rivalLine(p, 'amenaza', n)}`,
    `dlg-pacto:${rivalLine(p, 'pacto', n)}`,
    `dlg-huida:${rivalLine(p, 'huida', n)}`,
    `dlg-derrota:${rivalLine(p, 'derrota', n)}`,
  ];
}

/** The legendaries that can show up on this floor and haven't yet in this run. */
export function legendaryFor(g: Gen, floor: number, used: ReadonlySet<string>): (typeof legendaries.legendarios)[number] | undefined {
  const options = legendaries.legendarios.filter((l) => l.plantas.includes(floor) && !used.has(l.id));
  return options.length ? g.pick(options) : undefined;
}

/** A legendary as a creature (rivals.json, fixed numbers). */
type Legendary = (typeof legendaries.legendarios)[number];

/** A legendary's own line for a moment, from its hand-written frases/desenlaces (rivals.json). */
export function legendaryLine(l: Legendary, moment: Moment): string {
  const frases = l.frases;
  switch (moment) {
    case 'presentacion':
      return l.fraseNarrador ?? frases[0]!;
    case 'amenaza':
      return frases[1] ?? frases[0]!;
    case 'pacto':
      return l.desenlaces.pacto;
    case 'huida':
      return l.desenlaces.huida;
    case 'derrota':
      return l.desenlaces.derrotado;
    case 'vueltaHuida':
      return `${frases[2] ?? frases[0]!} ${l.desenlaces.huida}`;
    default:
      return frases[0]!;
  }
}

/** Fallback pact DC for legendaries, which have no comportamiento id (DESIGN.md §17). */
const LEGENDARY_PACTO_DIF = 16;

export function legendaryEntity(l: Legendary, floor: number, position: Vec2, opening: 'presentacion' | 'vueltaHuida' = 'presentacion'): Entity {
  const scale = rivalScale(floor);
  const bonus = scale.ataque;
  const attrs = (l.atributos ?? {}) as unknown as Record<string, number>;
  const e = createCreature({
    id: l.id,
    name: l.nombre,
    controllerId: 'ai',
    factionId: 'rivales',
    position,
    spriteId: l.spriteId,
    vida: Math.round(l.stats.vida * (scale.vida + 0.15)),
    def: l.stats.def + scale.def,
    ataque: l.stats.ataque + bonus,
    dano: l.stats.dano,
    movimiento: l.stats.movimiento,
    fue: attrs.fue ?? 5,
    tags: [
      'rival',
      'legendario',
      `raza:${l.raza.id}`,
      `genero:${l.genero}`,
      `pacto:${LEGENDARY_PACTO_DIF}`,
      `rnombre:${l.nombre}`,
      `rraza:${l.raza.nombre.toLowerCase()}`,
      `dlg-inicio:${legendaryLine(l, opening)}`,
      `dlg-amenaza:${legendaryLine(l, 'amenaza')}`,
      `dlg-pacto:${legendaryLine(l, 'pacto')}`,
      `dlg-huida:${legendaryLine(l, 'huida')}`,
      `dlg-derrota:${legendaryLine(l, 'derrota')}`,
      ...(l.rasgos ?? []).map((t) => `rasgo:${t.id}`),
    ],
  });
  const agi = attrs.agi ?? 0;
  return { ...e, stats: { ...e.stats, ...attrs, agi, armadura: l.stats.def + scale.def - 10 - Math.floor(agi / 2) } };
}

/** Chance a tramposo betrays a pact when it returns as an ally (docs/willy/DESIGN.md §17). 0 for everyone else. */
export function traicionChance(comportamientoId: string): number {
  return (generator.comportamientos.find((c) => c.id === comportamientoId) as { traicion?: number } | undefined)?.traicion ?? 0;
}

export const RIVAL_RULES = {
  roomChance: (floor: number): number => (rules.probabilidadSalaRival as Record<string, number>)[String(floor)] ?? 0.8,
  legendaryChance: rules.probabilidadLegendario,
  returnChance: rules.probabilidadVuelta,
};
