import type { Entity, Vec2 } from '../../../engine';
import { createCreature } from '../../../rulesets/willy';
import generator from '../data/rival-generator.json';
import legendaries from '../data/rivals.json';
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

export function rivalKeys(p: RivalProfile): string[] {
  return uniqueKeys(p);
}

/** Display name: «Txema el Breve». */
export function rivalName(p: RivalProfile): string {
  return `${p.nombre} ${p.apodo}`;
}

/** The rival as a creature: kit numbers scaled by floor (reglas.escalado) and the race's attributes. */
export function rivalEntity(p: RivalProfile, floor: number, position: Vec2): Entity {
  const kit = generator.kits.find((k) => k.id === p.kit)!;
  const raza = generator.razas.find((r) => r.id === p.raza)!;
  const bonus = Math.floor((floor - 1) / 2);
  const steps = Math.floor((floor - 1) / 2);
  const dano = stepDice(kit.dano, steps);
  const attrs = raza.atributos as unknown as Record<string, number>;
  const e = createCreature({
    id: p.id,
    name: rivalName(p),
    controllerId: 'ai',
    factionId: 'rivales',
    position,
    spriteId: `${raza.cuerpoBase}--${p.paleta}`,
    vida: Math.round(kit.vidaBase * (1 + 0.35 * (floor - 1))),
    def: kit.def + bonus,
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
    ],
  });
  // The race's attributes for checks and saves; DEF stays the kit's (armadura absorbs AGI).
  const agi = attrs.agi ?? 0;
  return { ...e, stats: { ...e.stats, ...attrs, agi, armadura: kit.def + bonus - 10 - Math.floor(agi / 2) } };
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

/** The legendaries that can show up on this floor and haven't yet in this run. */
export function legendaryFor(g: Gen, floor: number, used: ReadonlySet<string>): (typeof legendaries.legendarios)[number] | undefined {
  const options = legendaries.legendarios.filter((l) => l.plantas.includes(floor) && !used.has(l.id));
  return options.length ? g.pick(options) : undefined;
}

/** A legendary as a creature (rivals.json, fixed numbers). */
export function legendaryEntity(l: (typeof legendaries.legendarios)[number], floor: number, position: Vec2): Entity {
  const bonus = Math.floor((floor - 1) / 2);
  const attrs = (l.atributos ?? {}) as unknown as Record<string, number>;
  const e = createCreature({
    id: l.id,
    name: l.nombre,
    controllerId: 'ai',
    factionId: 'rivales',
    position,
    spriteId: l.spriteId,
    vida: Math.round(l.stats.vida * (1 + 0.2 * (floor - 1))),
    def: l.stats.def + bonus,
    ataque: l.stats.ataque + bonus,
    dano: l.stats.dano,
    movimiento: l.stats.movimiento,
    fue: attrs.fue ?? 5,
    tags: ['rival', 'legendario', `raza:${l.raza.id}`, `genero:${l.genero}`, ...(l.rasgos ?? []).map((t) => `rasgo:${t.id}`)],
  });
  const agi = attrs.agi ?? 0;
  return { ...e, stats: { ...e.stats, ...attrs, agi, armadura: l.stats.def + bonus - 10 - Math.floor(agi / 2) } };
}

export const RIVAL_RULES = {
  roomChance: (floor: number): number => (rules.probabilidadSalaRival as Record<string, number>)[String(floor)] ?? 0.8,
  legendaryChance: rules.probabilidadLegendario,
  returnChance: rules.probabilidadVuelta,
};
