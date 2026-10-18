import { type ActionOutcome, type Entity, type GameEvent, type GameState, type JsonValue, type LightSource, type LightingState, type MapZone, type Ruleset, type RngCursor, type Vec2, OBJECT_TAG, gridDistance, lightLevelAt, storedLighting, tileAt, zonesOf } from '../../../engine';
import { HANDLERS, extraActionSources } from '../actions';
import { createCreature } from '../character';
import { parseDice, rollDice } from '../dice';
import { Resolver, type WillyEvent, damageModifierHooks, dealDamage, standing } from '../resolve';
import { WILLY_ID, clone, showConfig } from './config';
import { setBossLitHook } from './share';

/**
 * The final boss's phases (floors.json → jefe-presentador → fases; numbers in
 * content/willy/data/jefe-final.json). The Share and the Gran final's vote are in share.ts.
 *
 * 1. Ronda de preguntas (100-66 % health): every `cadencia` rounds he asks one of the questions;
 *    three coloured tiles light up near Willy. At the end of the next round whoever stands on a
 *    false one drops through the trapdoor (damage and Tumbado); if someone of the party is on
 *    the right one, he is under a spotlight for a round («alergia a los focos»: +50 % damage).
 * 2. Pausa publicitaria (66-33 %): the lights go out. He only takes damage while lit (×1.5):
 *    the party switches on the room's spotlights («Encender foco», adjacent, 1 action) and a
 *    moving spotlight sweeps the room every round. His hits on Willy bite the audience
 *    (shareStolen). Every few rounds two azafatos join.
 * 3. Gran final (33-0 %): the lights come back; the audience votes (share.ts).
 *
 * The arena is dressed at runtime from his encounter zone, so any boss room works.
 * state.systems.jefeFinal holds the fight. Events: bossPhase { jefe, fase, nombre, momento? },
 * bossLine { texto } (the presenter talks), bossQuestion { texto, opciones }, trapdoorOpened
 * { entityId }, spotlightOn { focoId, position }.
 */

export interface BossConfig {
  jefeId: string;
  nombre: string;
  fases: { hasta: number; nombre: string }[];
  preguntas: { texto: string; correcta: string; falsas: string[] }[];
  frases: { id: string; al: string; texto: string }[];
  rondaDePreguntas: { cadencia: number; distancia: number; dano: string; rondasFoco: number; colores: { id: string; nombre: string; color: string }[] };
  pausaPublicitaria: {
    ambiente: number;
    focos: number;
    radioFoco: number;
    intensidadFoco: number;
    rondasFoco: number;
    focoMovil: { probJefe: number; radio: number; intensidad: number };
    umbralLuz: number;
    mordiscoPct: number;
    azafatosCada: number;
    azafatos: number;
    azafato: { nombre: string; sprite: string; vida: number; def: number; ataque: number; dano: string; movimiento: number; xp: number };
  };
  alergiaALosFocos: number;
}

interface QuestionTile {
  position: Vec2;
  respuesta: string;
  correcta: boolean;
  color: string;
  colorNombre: string;
}

export interface BossFight {
  fase: number;
  /** Last round whose end was processed. */
  ronda: number;
  zona: { x: number; y: number; width: number; height: number };
  pregunta: { idx: number; ronda: number; baldosas: QuestionTile[] } | null;
  hechas: number[];
  /** Spotlights of the Pausa publicitaria: where, and until which round they are on. */
  focos: { id: string; position: Vec2; hasta: number }[];
  /** The moving spotlight this round: on him ('jefe', it follows him), on a tile, or off. */
  movil: Vec2 | 'jefe' | null;
  /** Round until which he is under a spotlight (a right answer). */
  iluminadoHasta: number;
  /** The map's lighting before the lights went out. */
  luz: LightingState | null;
  azafatos: number;
  dichas: string[];
}

export function bossFightOf(state: GameState): BossFight | undefined {
  return state.systems.jefeFinal as unknown as BossFight | undefined;
}

const cfg = (): BossConfig | undefined => showConfig()?.boss;

function bossOf(state: GameState): Entity | undefined {
  const c = cfg();
  const b = c ? state.entities[c.jefeId] : undefined;
  return b && standing(b) ? b : undefined;
}

function line(r: Resolver, f: BossFight, al: string): void {
  const c = cfg()!;
  const options = c.frases.filter((x) => x.al === al);
  if (!options.length) return;
  const unused = options.filter((x) => !f.dichas.includes(x.id));
  const pick = (unused.length ? unused : options)[r.rng.die((unused.length ? unused : options).length) - 1]!;
  f.dichas.push(pick.id);
  r.emit({ type: 'bossLine', jefe: c.jefeId, presentador: c.nombre, momento: al, texto: pick.texto } as unknown as WillyEvent);
}

function phaseFor(pct: number): number {
  const fases = cfg()!.fases;
  // fases[i].hasta: health % where phase i+1 starts (100, 66, 33).
  let fase = 1;
  fases.forEach((p, i) => {
    if (pct <= p.hasta) fase = i + 1;
  });
  return fase;
}

function zoneOf(state: GameState, boss: Entity): BossFight['zona'] {
  const z = zonesOf(state, 'encounters').find((zz: MapZone) => String(zz.properties.participants ?? '').split(',').includes(boss.id))
    ?? zonesOf(state).find((zz) => boss.position.x >= zz.x && boss.position.x < zz.x + zz.width && boss.position.y >= zz.y && boss.position.y < zz.y + zz.height);
  if (z) return { x: z.x, y: z.y, width: z.width, height: z.height };
  return { x: boss.position.x - 4, y: boss.position.y - 4, width: 9, height: 9 };
}

function freeTiles(state: GameState, f: BossFight): Vec2[] {
  const taken = new Set(Object.values(state.entities).filter((e) => standing(e) || e.tags.includes(OBJECT_TAG)).map((e) => `${e.position.x},${e.position.y}`));
  const out: Vec2[] = [];
  for (let y = f.zona.y; y < f.zona.y + f.zona.height; y++) {
    for (let x = f.zona.x; x < f.zona.x + f.zona.width; x++) {
      if (tileAt(state.map, { x, y })?.walkable && !taken.has(`${x},${y}`)) out.push({ x, y });
    }
  }
  return out;
}

function shuffle<T>(r: Resolver, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.rng.die(i + 1) - 1;
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The lights of the fight: the question tiles, the spotlights that are on and the moving one. */
function setLights(r: Resolver, f: BossFight, round: number): void {
  const c = cfg()!;
  const base: LightingState = f.fase === 2 ? { ambient: c.pausaPublicitaria.ambiente, lights: [] } : (f.luz ?? storedLighting(r.state));
  const own: LightSource[] = [];
  if (f.pregunta) for (const [i, t] of f.pregunta.baldosas.entries()) own.push({ id: `jefe:pregunta-${i}`, position: t.position, radius: 1, intensity: 0.7, color: t.color, flicker: 0.1 });
  if (f.fase === 2) {
    const p = c.pausaPublicitaria;
    for (const foco of f.focos) {
      const on = foco.hasta >= round;
      own.push({ id: `jefe:${foco.id}`, position: foco.position, radius: on ? p.radioFoco : 1, intensity: on ? p.intensidadFoco : 0.15, color: on ? '#fff6d8' : '#ff3030', flicker: on ? 0 : 0.2 });
    }
    // The moving spotlight follows him when it caught him; otherwise it rests on a tile.
    if (f.movil === 'jefe') own.push({ id: 'jefe:foco-movil', attachedTo: c.jefeId, radius: p.focoMovil.radio, intensity: p.focoMovil.intensidad, color: '#fffbe8', flicker: 0 });
    else if (f.movil) own.push({ id: 'jefe:foco-movil', position: f.movil, radius: p.focoMovil.radio, intensity: p.focoMovil.intensidad, color: '#fffbe8', flicker: 0 });
  }
  const lights = [...base.lights.filter((l) => !l.id.startsWith('jefe:')), ...own];
  r.apply({ type: 'setSystem', system: 'lighting', value: { ambient: base.ambient, lights } as unknown as JsonValue });
}

function askQuestion(r: Resolver, f: BossFight, round: number): void {
  const c = cfg()!;
  const q = c.rondaDePreguntas;
  const pending = c.preguntas.map((_, i) => i).filter((i) => !f.hechas.includes(i));
  const pool = pending.length ? pending : c.preguntas.map((_, i) => i);
  const idx = pool[r.rng.die(pool.length) - 1]!;
  const data = c.preguntas[idx]!;
  const willy = r.state.entities[WILLY_ID];
  const near = freeTiles(r.state, f).filter((t) => !willy || gridDistance(t, willy.position) <= q.distancia);
  const tiles = shuffle(r, near).slice(0, 3);
  if (tiles.length < 3) return;
  const answers = shuffle(r, [{ respuesta: data.correcta, correcta: true }, ...data.falsas.slice(0, 2).map((x) => ({ respuesta: x, correcta: false }))]);
  const baldosas: QuestionTile[] = tiles.map((position, i) => ({ position, ...answers[i]!, color: q.colores[i]!.color, colorNombre: q.colores[i]!.nombre }));
  f.pregunta = { idx, ronda: round, baldosas };
  f.hechas.push(idx);
  line(r, f, 'pregunta');
  r.emit({ type: 'bossQuestion', jefe: c.jefeId, texto: data.texto, opciones: baldosas.map((b) => ({ color: b.color, colorNombre: b.colorNombre, respuesta: b.respuesta, position: b.position })) } as unknown as WillyEvent);
}

function resolveQuestion(r: Resolver, f: BossFight, round: number): void {
  const c = cfg()!;
  const p = f.pregunta!;
  f.pregunta = null;
  let right = false;
  let fell = false;
  for (const t of p.baldosas) {
    for (const e of Object.values(r.state.entities)) {
      if (!standing(e) || e.tags.includes(OBJECT_TAG) || e.position.x !== t.position.x || e.position.y !== t.position.y) continue;
      if (t.correcta) {
        if (e.factionId === r.state.entities[WILLY_ID]?.factionId) right = true;
        continue;
      }
      fell = true;
      r.emit({ type: 'trapdoorOpened', entityId: e.id, position: t.position } as unknown as WillyEvent);
      r.apply({ type: 'applyCondition', entityId: e.id, condition: 'tumbado' });
      dealDamage(r, e.id, rollDice(r.rng, parseDice(c.rondaDePreguntas.dano)), 'golpe', undefined, 'caida');
    }
  }
  if (right) {
    f.iluminadoHasta = round + c.rondaDePreguntas.rondasFoco;
    line(r, f, 'aciertoWilly');
  } else if (fell) line(r, f, 'falloWilly');
}

function placeSpotlights(r: Resolver, f: BossFight): void {
  const p = cfg()!.pausaPublicitaria;
  const tiles = freeTiles(r.state, f);
  // Spread them out: the first at random, then each the farthest from those already placed.
  const chosen: Vec2[] = [];
  if (tiles.length) chosen.push(tiles[r.rng.die(tiles.length) - 1]!);
  while (chosen.length < p.focos && chosen.length < tiles.length) {
    const next = tiles.reduce((best, t) => (Math.min(...chosen.map((c) => gridDistance(c, t))) > Math.min(...chosen.map((c) => gridDistance(c, best))) ? t : best), tiles[0]!);
    chosen.push(next);
  }
  f.focos = chosen.map((position, i) => ({ id: `foco-${i}`, position, hasta: -1 }));
}

function spawnAzafatos(r: Resolver, f: BossFight, boss: Entity): void {
  const p = cfg()!.pausaPublicitaria;
  const spots = freeTiles(r.state, f).sort((a, b) => gridDistance(a, boss.position) - gridDistance(b, boss.position));
  for (let i = 0; i < p.azafatos && spots[i]; i++) {
    f.azafatos += 1;
    const a = p.azafato;
    const entity = createCreature({ id: `azafato-${f.azafatos}`, name: a.nombre, controllerId: boss.controllerId, factionId: boss.factionId, position: spots[i]!, spriteId: a.sprite, vida: a.vida, def: a.def, ataque: a.ataque, dano: a.dano, movimiento: a.movimiento, tags: [`invocado-por:${boss.id}`, ...(a.xp ? [`xp:${a.xp}`] : [])] });
    r.apply({ type: 'spawnEntity', entity, ownerId: boss.id });
  }
}

function enterPhase(r: Resolver, f: BossFight, fase: number, round: number): void {
  const c = cfg()!;
  const from = f.fase;
  f.fase = fase;
  if (from === 1 && f.pregunta) f.pregunta = null;
  if (fase === 2) {
    f.luz = storedLighting(r.state);
    f.luz = { ambient: f.luz.ambient, lights: f.luz.lights.filter((l) => !l.id.startsWith('jefe:') && !l.id.startsWith('surface:')) };
    placeSpotlights(r, f);
    line(r, f, 'cambioFase');
  }
  if (fase === 3 && f.luz) {
    r.apply({ type: 'setSystem', system: 'lighting', value: f.luz as unknown as JsonValue });
    f.focos = [];
    f.movil = null;
  }
  r.emit({ type: 'bossPhase', jefe: c.jefeId, fase, nombre: c.fases[fase - 1]?.nombre ?? '' } as unknown as WillyEvent);
  setLights(r, f, round);
}

/** True while he is lit: a right answer, a spotlight that is on, or the moving one on him. */
export function bossLit(state: GameState, f: BossFight | undefined = bossFightOf(state)): boolean {
  const c = cfg();
  const boss = c ? state.entities[c.jefeId] : undefined;
  if (!c || !boss || !f) return false;
  if (f.iluminadoHasta >= state.turn.round) return true;
  if (f.fase !== 2) return false;
  return lightLevelAt(state, boss.position) >= c.pausaPublicitaria.umbralLuz;
}

/** The fight, once per command (Ruleset.afterCommand, before the show so the Share sees the bites). */
export function bossAfterCommand(ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  const c = cfg();
  if (!c) return { effects: [], events: [] };
  const existing = bossFightOf(state);
  const boss = bossOf(state);
  const r = new Resolver(ruleset, state, rng);

  // Over (he fell, or the combat ended): lights back, bookkeeping gone.
  if (existing && (!boss || state.turn.mode !== 'combat')) {
    if (events.some((e) => e.type === 'entityDefeated' && (e as unknown as { entityId: string }).entityId === c.jefeId)) line(r, clone(existing), 'derrotado');
    if (existing.luz && existing.fase === 2) r.apply({ type: 'setSystem', system: 'lighting', value: existing.luz as unknown as JsonValue });
    else {
      const l = storedLighting(state);
      if (l.lights.some((x) => x.id.startsWith('jefe:'))) r.apply({ type: 'setSystem', system: 'lighting', value: { ambient: l.ambient, lights: l.lights.filter((x) => !x.id.startsWith('jefe:') && !x.id.startsWith('surface:')) } as unknown as JsonValue });
    }
    const { jefeFinal: _gone, ...systems } = r.state.systems;
    r.state = { ...r.state, systems };
    r.apply({ type: 'setSystem', system: 'jefeFinal', value: null as unknown as JsonValue });
    return r.outcome();
  }
  if (!boss || state.turn.mode !== 'combat' || !state.turn.order.includes(boss.id)) return { effects: [], events: [] };

  const round = state.turn.round;
  const f: BossFight = clone(existing ?? { fase: 1, ronda: round, zona: zoneOf(state, boss), pregunta: null, hechas: [], focos: [], movil: null, iluminadoHasta: -1, luz: null, azafatos: 0, dichas: [] });
  if (!existing) {
    line(r, f, 'inicioCombate');
    r.emit({ type: 'bossPhase', jefe: c.jefeId, fase: 1, nombre: c.fases[0]?.nombre ?? '' } as unknown as WillyEvent);
  }

  // Health thresholds.
  const hp = boss.resources.vida!;
  const target = phaseFor((100 * hp.current) / hp.max);
  if (target > f.fase) enterPhase(r, f, target, round);

  // Round ends: questions, trapdoors, spotlights, azafatos.
  while (f.ronda < round) {
    f.ronda += 1;
    const now = f.ronda;
    if (f.fase === 1) {
      if (f.pregunta && f.pregunta.ronda < now) resolveQuestion(r, f, now);
      if (!f.pregunta && now % c.rondaDePreguntas.cadencia === 0) askQuestion(r, f, now);
    }
    if (f.fase === 2) {
      const p = c.pausaPublicitaria;
      const b = r.state.entities[c.jefeId];
      const tiles = freeTiles(r.state, f);
      f.movil = b && r.rng.die(100) <= p.focoMovil.probJefe * 100 ? 'jefe' : (tiles[r.rng.die(Math.max(1, tiles.length)) - 1] ?? null);
      if (b && now % p.azafatosCada === 0) spawnAzafatos(r, f, b);
    }
    setLights(r, f, now);
  }

  // His bite in the dark, and the moments the Narrador comments.
  for (const e of events) {
    const x = e as unknown as Record<string, unknown>;
    if (f.fase === 2 && e.type === 'attackRolled' && x.attackerId === c.jefeId && x.targetId === WILLY_ID && x.hit) {
      r.emit({ type: 'shareStolen', pct: c.pausaPublicitaria.mordiscoPct, entityId: c.jefeId } as unknown as WillyEvent);
      line(r, f, 'mordisco');
      r.emit({ type: 'bossPhase', jefe: c.jefeId, fase: f.fase, momento: 'mordisco' } as unknown as WillyEvent);
    }
    if (e.type === 'shareCero') r.emit({ type: 'bossPhase', jefe: c.jefeId, fase: f.fase, momento: 'shareCero' } as unknown as WillyEvent);
    if (e.type === 'enAntena' && !f.dichas.includes('momento:vidaUno')) {
      f.dichas.push('momento:vidaUno');
      line(r, f, 'vidaUno');
      r.emit({ type: 'bossPhase', jefe: c.jefeId, fase: f.fase, momento: 'vidaUno' } as unknown as WillyEvent);
    }
    if (e.type === 'spotlightOn') setLights(r, f, round);
    // The first spotlit blow of each round: «¡Ese foco!».
    if (e.type === 'bossUnderSpotlight' && !f.dichas.includes(`bajoFoco:${round}`)) {
      f.dichas.push(`bajoFoco:${round}`);
      if (!f.dichas.includes('momento:bajoFoco')) {
        f.dichas.push('momento:bajoFoco');
        line(r, f, 'bajoFoco');
      }
      r.emit({ type: 'bossPhase', jefe: c.jefeId, fase: f.fase, momento: 'bajoFoco' } as unknown as WillyEvent);
    }
  }

  r.apply({ type: 'setSystem', system: 'jefeFinal', value: f as unknown as JsonValue });
  return r.outcome();
}

setBossLitHook((state) => bossLit(state));

// In the dark he only takes damage while lit; a spotlight makes it hurt more.
damageModifierHooks.push((r, targetId, amount) => {
  const c = cfg();
  if (!c || targetId !== c.jefeId) return amount;
  const f = bossFightOf(r.state);
  if (!f) return amount;
  const lit = bossLit(r.state, f);
  if (f.fase === 2 && !lit) {
    r.emit({ type: 'bossInDark', entityId: targetId } as unknown as WillyEvent);
    return 0;
  }
  if (lit) r.emit({ type: 'bossUnderSpotlight', entityId: targetId } as unknown as WillyEvent);
  return lit ? amount * c.alergiaALosFocos : amount;
});

// «Encender foco»: next to a spotlight that is off, during the Pausa publicitaria.
function spotlightNear(state: GameState, actor: Entity): BossFight['focos'][number] | undefined {
  const f = bossFightOf(state);
  if (!f || f.fase !== 2) return undefined;
  return f.focos.find((foco) => foco.hasta < state.turn.round && gridDistance(foco.position, actor.position) <= 1);
}

HANDLERS['show:encender-foco'] = {
  target: { kind: 'self', range: 0 },
  tags: ['show'],
  preview: (state, actor) => (spotlightNear(state, actor) ? { valid: true } : { valid: false, reason: 'No hay ningún foco apagado a tu lado.' }),
  perform: (r, id) => {
    const actor = r.entity(id);
    const f = clone(bossFightOf(r.state)!);
    const foco = f.focos.find((x) => x.hasta < r.state.turn.round && gridDistance(x.position, actor.position) <= 1);
    if (!foco) return;
    foco.hasta = r.state.turn.round + cfg()!.pausaPublicitaria.rondasFoco - 1;
    r.apply({ type: 'setSystem', system: 'jefeFinal', value: f as unknown as JsonValue });
    r.emit({ type: 'spotlightOn', entityId: id, focoId: foco.id, position: foco.position } as unknown as WillyEvent);
  },
};

extraActionSources.push((state, e) => {
  if (!e.tags.includes('pc') && !e.tags.some((t) => t.startsWith('companero-de:'))) return [];
  if (!spotlightNear(state, e)) return [];
  return [{ id: 'show:encender-foco', label: 'Encender foco', description: 'Enciende el foco que tienes al lado. Bajo su luz, el presentador se puede dañar (y le duele más).', cost: { acciones: 1 }, target: { kind: 'self', range: 0 }, tags: ['show'] }];
});
