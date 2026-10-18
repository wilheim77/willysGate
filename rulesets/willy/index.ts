import {
  type ActionOutcome,
  type CheckRequest,
  type ConditionDef,
  type GameEvent,
  type GameState,
  type GlossaryEntry,
  type ResourceDef,
  type RngCursor,
  type Ruleset,
  type StatDef,
  applyEffects,
  gridDistance,
  hasCondition,
  hasTag,
  isHostile,
  stat,
  surfaceAt,
} from '../../engine';
import { d20Check, resolveRollMode } from '../common/d20';
import { BARREL_BLAST, listActions, performAction, previewAction, setWillyRef } from './actions';
import './more-classes';
import './summons';
import { syncCompanions } from './companions';
import './xp';
import { ATTRS, ATTR_LABELS, attr, baseMovement, classOf, hasTrait, level, skillLevel, useResource } from './character';
import { type Attr, CLASSES, WILLY, allAbilityIds } from './data';
import { SURFACES, SURFACE_REACTIONS, noticeTrap, onFall, onRoundEnd, onSurface, triggerTrap } from './environment';
import { Resolver, type WillyEvent, automatonSignal, canAct, chanceD20, dealDamage, heal, onCollision, onVoid, pushEntity, rollSave, standing } from './resolve';
import { antennaShots } from './summons';
import { describeEntity } from './sheet';
import { showAfterCommand, showCommands } from './show';
import { achievementsHook } from './achievements';
import { equipItem, equippedInSlotOf, equippedOnEntity, itemSlotOf, itemUseOf, itemsHook, unequipItem } from './items';
import { dropsHook, openBox } from './loot';
import { regenHook } from './regen';

/**
 * «El Reglamento del Concurso»: Willy's light d20 ruleset (docs/willy/RULESET.md).
 * d20 + a visible attribute against a number; 2 actions per turn; skills that level with use;
 * the environment (pushes, falls, surfaces, height) is the strongest weapon.
 */

const stats: Record<string, StatDef> = {
  ...Object.fromEntries(ATTRS.map((a) => [a, { label: ATTR_LABELS[a] }])),
  nivel: { label: 'Nivel' },
  armadura: { label: 'Armadura' },
  ataque: { label: 'Ataque' },
  movimiento: { label: 'Movimiento' },
  // Worn items' bonuses (items.json → pasivo); most are read by the systems they name.
  bonoGanso: { label: 'Bonus de «Hacer el ganso»' },
  defEnAgua: { label: 'DEF en agua' },
  defDistancia: { label: 'DEF a distancia' },
  verVida: { label: 'Ver la vida de los enemigos' },
  alcanceSenal: { label: 'Alcance de la señal' },
  alcanceSalto: { label: 'Alcance de salto' },
  bonoFichas: { label: 'Bonus de fichas' },
  reduccionTrampas: { label: 'Daño de trampas reducido' },
  deteccion: { label: 'Detección' },
  objetosPorCofre: { label: 'Objetos por cofre' },
  mimicosPct: { label: 'Mímicos' },
  radioLuz: { label: 'Radio de luz' },
  huecos: { label: 'Huecos de mochila' },
  multAudiencia: { label: 'Multiplicador de audiencia' },
};

const resources: Record<string, ResourceDef> = {
  vida: { label: 'Vida', refresh: 'longRest', visible: true, role: 'health' },
  energia: { label: 'Energía', refresh: 'shortRest', visible: true },
  acciones: { label: 'Acciones', refresh: 'turn' },
  fichas: { label: 'Fichas', refresh: 'never', visible: true },
  xp: { label: 'Experiencia', refresh: 'never' },
  ...Object.fromEntries(allAbilityIds().map((id) => [useResource(id), { label: `Usos: ${id}`, refresh: 'never' } as ResourceDef])),
};

const conditions: Record<string, ConditionDef> = {
  ardiendo: { label: 'Ardiendo', description: '1d4 de fuego al empezar el turno. El agua lo apaga.' },
  empapado: { label: 'Empapado', description: 'El rayo hace el doble. No puede arder. Con frío, se congela.' },
  congelado: { label: 'Congelado', description: 'No puede moverse; recibe +2 de daño de golpe.' },
  electrocutado: { label: 'Electrocutado', description: 'Pierde 1 acción el próximo turno.' },
  envenenado: { label: 'Envenenado', description: '1 de daño por turno.' },
  tumbado: { label: 'Tumbado', description: 'Levantarse cuesta medio movimiento; +3 a que le peguen cuerpo a cuerpo.' },
  aturdido: { label: 'Aturdido', description: 'Pierde el turno.' },
  asustado: { label: 'Asustado', description: 'Tiene que alejarse de quien le asustó.' },
  cegado: { label: 'Cegado', description: '−5 a atacar.' },
  enredado: { label: 'Enredado', description: 'No puede moverse hasta liberarse.' },
  bailando: { label: 'Bailando', description: 'Se mueve 1 casilla al azar al empezar su turno.' },
  mareado: { label: 'Mareado', description: '−2 a todo.' },
  escondido: { label: 'Escondido', description: 'No le eligen como objetivo; se pierde al atacar.' },
  animado: { label: 'Animado', description: '+1 al daño.' },
  dormido: { label: 'Dormido', description: 'Pierde el turno; se despierta si le hacen daño.' },
  petrificado: { label: 'Petrificado', description: 'No actúa ni recibe daño.' },
  afortunado: { label: 'Afortunado', description: 'Tira dos d20 y se queda el mejor.' },
  compulsado: { label: 'Compulsado', description: '+2 a todas las tiradas e inmune a Aturdido.' },
  protegidoFuego: { label: 'Crema solar', description: 'Inmune a Ardiendo y al daño de fuego.' },
  silenciado: { label: 'Silenciado', description: 'No puede usar habilidades ni atacar a distancia.' },
  corriendo: { label: 'Corriendo', description: 'Otro movimiento completo este turno.' },
  salto: { label: 'En el aire', description: 'Acaba de saltar: puede hacer un mate.' },
  'cafe-tomado': { label: 'Café tomado', description: 'Ya ha hecho la pausa del café en este combate.' },
  pasodoble: { label: 'Pasodoble', description: '+2 a acertar.' },
  viral: { label: 'Viral', description: 'El próximo momento espectacular vale el triple de audiencia.' },
  orquesta: { label: 'Orquesta en directo', description: 'Cada turno, los enemigos bailan y tú te curas.' },
  'bis-activo': { label: '¡Otra, otra!', description: 'Repitiendo la última canción.' },
  estudiado: { label: 'Estudiado', description: 'El Tasador le ha echado el ojo: le acierta mejor y con más críticos.' },
  encajado: { label: 'En una caja invisible', description: 'No puede moverse ni actuar, ni nadie le puede tocar.' },
  pena: { label: 'Qué pena', description: 'Ha roto algo de época: pierde 1 acción.' },
  eliminado: { label: 'Eliminado', description: 'Fuera del concurso. O de esta planta, al menos.' },
};

const glossary: Record<string, GlossaryEntry> = {
  d20: { label: 'Tirada (d20)', text: 'Tiras un dado de 20 caras y sumas el atributo que toque. Si igualas o superas el número objetivo, lo consigues.' },
  def: { label: 'Defensa', text: 'Lo difícil que es acertarle a alguien: 10 + la mitad de su Agilidad + armadura.' },
  dif: { label: 'DIF (dificultad)', text: 'El número que hay que igualar en una prueba: 10 es fácil, 16 normal, 20 difícil.' },
  critico: { label: 'Crítico', text: 'Un 20 en el dado: aciertas siempre y los dados de daño cuentan doble.' },
  pifia: { label: 'Pifia', text: 'Un 1 en el dado: fallas siempre.' },
  altura: { label: 'Desde arriba', text: '+2 a acertar por cada nivel por encima del objetivo, hasta +4.' },
  flanqueo: { label: 'Flanqueo', text: '+2 cuerpo a cuerpo si un aliado tuyo está pegado al objetivo.' },
  oscuridad: { label: 'A oscuras', text: '−2 a acertar a un objetivo que está a oscuras.' },
  empujar: { label: 'Empujar', text: 'Prueba de Fuerza contra 8 + la Fuerza del otro. Contra un muro: 1d6. Contra otro: 1d4 a los dos. Al vacío: eliminado (los jefes no caen, pero les duele).' },
  caida: { label: 'Caída', text: 'Bajar un nivel no hace daño; desde 2 niveles, 1d6 por cada nivel de más, y caes tumbado.' },
  habilidad: { label: 'Nivel de habilidad', text: 'Cada habilidad sube del 1 al 5 a base de usarla con efecto. Hasta el empujón mejora si empujas mucho.' },
  energia: { label: 'Energía', text: 'La gastan las habilidades. Se recupera entera al acabar cada combate.' },
  vida: { label: 'Vida', text: 'A 0, eliminado.' },
  tumbado: { label: 'Tumbado', text: 'En el suelo: +3 a pegarle cuerpo a cuerpo, −2 a distancia; levantarse cuesta medio movimiento.' },
  cegado: { label: 'Cegado', text: '−5 a atacar.' },
  mareado: { label: 'Mareado', text: '−2 a todo.' },
  compulsado: { label: 'Compulsado', text: '+2 a todas las tiradas: lleva sello oficial.' },
};

/** Named checks and the attribute they use. */
const CHECK_ATTR: Record<string, Attr> = {
  trepar: 'agi', saltar: 'agi', equilibrio: 'agi', esconderse: 'agi',
  forzar: 'man', trampas: 'man', cerraduras: 'man', detectar: 'man', reparar: 'man',
  romper: 'fue', levantar: 'fue', resistirEmpujon: 'fue',
  aguantar: 'agu', resistirVeneno: 'agu',
  convencer: 'car', mentir: 'car', regatear: 'car', intimidar: 'car', ganso: 'car',
  suerte: 'sue', tombola: 'sue',
};

const CHECK_LABELS: Record<string, string> = { trepar: 'Trepar', forzar: 'Forzar', convencer: 'Convencer', tombola: 'Tómbola', detectar: 'Detectar', regatear: 'Regatear' };

function parseCheck(check: string): { attr: Attr; label: string; skill?: string } {
  if ((ATTRS as string[]).includes(check)) return { attr: check as Attr, label: ATTR_LABELS[check as Attr] };
  if (check.startsWith('save:')) {
    const a = check.slice(5) as Attr;
    if ((ATTRS as string[]).includes(a)) return { attr: a, label: `Resistir (${ATTR_LABELS[a]})` };
  }
  const a = CHECK_ATTR[check];
  if (a) return { attr: a, label: CHECK_LABELS[check] ?? check, ...(check === 'trepar' ? { skill: 'trepar' } : {}) };
  throw new Error(`willy: unknown check "${check}"`);
}

function checkBonus(state: GameState, req: CheckRequest): { modifiers: { label: string; value: number; term?: string }[]; mode: 'normal' | 'advantage' } {
  const actor = state.entities[req.actorId]!;
  const { attr: a, skill } = parseCheck(req.check);
  const modifiers: { label: string; value: number; term?: string }[] = [{ label: ATTR_LABELS[a], value: attr(actor, a) }];
  if (skill === 'trepar') {
    const lvl = skillLevel(actor, 'trepar');
    if (lvl >= 2) modifiers.push({ label: 'Trepar', value: 3, term: 'habilidad' });
    if (hasTrait(actor, 'dos-metros-cuatro')) modifiers.push({ label: 'Dos metros cuatro', value: 2 });
  }
  if (hasCondition(actor, 'mareado')) modifiers.push({ label: 'Mareado', value: -2, term: 'mareado' });
  if (hasCondition(actor, 'compulsado')) modifiers.push({ label: 'Compulsado', value: 2, term: 'compulsado' });
  for (const tag of req.situational ?? []) {
    const m = /^bono:(-?\d+):(.+)$/.exec(tag);
    if (m) modifiers.push({ label: m[2]!, value: Number(m[1]) });
  }
  return { modifiers, mode: resolveRollMode(hasCondition(actor, 'afortunado') || (req.situational ?? []).includes('ventaja'), false) === 'advantage' ? 'advantage' : 'normal' };
}

function resolveCheck(state: GameState, req: CheckRequest, rng: RngCursor) {
  const { label } = parseCheck(req.check);
  const { modifiers, mode } = checkBonus(state, req);
  const result = d20Check(rng, { check: req.check, label, mode, modifiers, target: req.target, targetLabel: 'DIF' });
  const natural = result.dice[0]!.kept[0]!;
  // Natural 20 always succeeds, natural 1 always fails (RULESET.md).
  result.success = natural === 20 || (natural !== 1 && result.total >= req.target);
  if (natural === 20) result.outcome = 'critical_success';
  if (natural === 1) result.outcome = 'fumble';
  result.targetTerm = 'dif';
  return result;
}

function describeCheck(state: GameState, req: CheckRequest) {
  const { label } = parseCheck(req.check);
  const { modifiers, mode } = checkBonus(state, req);
  return { label, chance: chanceD20(modifiers.reduce((s, m) => s + m.value, 0), req.target, mode) };
}

/** DIF an entity imposes: 10 + half of the attribute behind the source (Maña by default). */
function difficulty(state: GameState, entityId: string, source: string): number {
  const e = state.entities[entityId];
  if (!e) throw new Error(`willy: unknown entity "${entityId}"`);
  const a: Attr = (ATTRS as string[]).includes(source) ? (source as Attr) : source === 'carisma' ? 'car' : 'man';
  return 10 + Math.floor(attr(e, a) / 2);
}

const NO_MOVE = ['aturdido', 'congelado', 'enredado', 'dormido', 'petrificado', 'eliminado', 'encajado'];

function movementBudget(e: Parameters<Ruleset['movementBudget']>[0], state: GameState): number {
  if (NO_MOVE.some((c) => hasCondition(e, c))) return 0;
  const inWater = hasTrait(e, 'pez') && surfaceAt(state, e.position)?.type === 'agua';
  const base = baseMovement(e) - (hasTrait(e, 'clonc') ? 1 : 0) + (inWater ? 2 : 0) + (hasCondition(e, 'pasodoble') && skillLevel(e, 'pasodoble') >= 5 ? 2 : 0);
  const total = base * (hasCondition(e, 'corriendo') ? 2 : 1);
  const standUp = hasCondition(e, 'tumbado') ? Math.ceil(base / 2) : 0;
  return Math.max(0, total - standUp);
}

/** Start of turn: burning, poison, dancing, electrocution, «Hablar del tiempo», round things. */
function onTurnStart(ruleset: Ruleset, state: GameState, id: string, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id]!;
  if (!standing(e)) return r.outcome();
  if (hasCondition(e, 'ardiendo')) dealDamage(r, id, rng.die(4), 'fuego', undefined, 'ardiendo');
  if (hasCondition(r.entity(id), 'envenenado')) dealDamage(r, id, 1, 'veneno', undefined, 'veneno');
  if (!standing(r.entity(id))) return r.outcome();
  if (hasCondition(e, 'electrocutado')) {
    r.apply({ type: 'modifyResource', entityId: id, resource: 'acciones', delta: -1 }, { type: 'removeCondition', entityId: id, condition: 'electrocutado' });
  }
  if (hasCondition(e, 'bailando')) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    const [dx, dy] = dirs[rng.die(8) - 1]!;
    pushEntity(r, id, { x: e.position.x - dx, y: e.position.y - dy }, 1);
  }
  if (hasCondition(e, 'pena')) {
    r.apply({ type: 'modifyResource', entityId: id, resource: 'acciones', delta: -1 }, { type: 'removeCondition', entityId: id, condition: 'pena' });
  }
  // Orquesta completa: everyone around keeps dancing and the Bardo heals.
  if (hasCondition(e, 'orquesta')) {
    heal(r, id, skillLevel(e, 'orquesta-completa') >= 3 ? 5 : 3);
    for (const v of Object.values(state.entities)) {
      if (!standing(v) || !isHostile(v, e) || gridDistance(v.position, e.position) > 6) continue;
      r.apply({ type: 'applyCondition', entityId: v.id, condition: 'bailando', sourceId: id, remainingTurns: 1 });
      if (skillLevel(e, 'orquesta-completa') >= 4) dealDamage(r, v.id, rng.die(4), 'golpe', id, 'pisoton');
    }
  }
  // Antennas fire when their engineer's turn starts; automatons far from the engineer lose the signal.
  antennaShots(r, id);
  if (automatonSignal(state, e) < 0) r.apply({ type: 'applyCondition', entityId: id, condition: 'mareado', remainingTurns: 1 });
  // «Hablar del tiempo»: the first combat turn on each map, Willy loses an action chatting about the weather.
  const flag = `willy:tiempo:${state.map.id}`;
  if (hasTrait(e, 'hablar-del-tiempo') && state.turn.mode === 'combat' && !state.flags[flag]) {
    r.apply({ type: 'modifyResource', entityId: id, resource: 'acciones', delta: -1 }, { type: 'setFlag', flag, value: true });
    r.emit({ type: 'traitTriggered', entityId: id, rasgo: 'hablar-del-tiempo' } as WillyEvent);
  }
  // «Cosas redondas»: something round nearby, 25 % of a shot at it.
  if (hasTrait(e, 'cosas-redondas')) {
    const round = Object.values(state.entities).find((o) => o.id !== id && hasTag(o, 'redondo') && standing(o) && gridDistance(o.position, e.position) <= 3);
    if (round && rng.die(4) === 1) {
      r.apply({ type: 'modifyResource', entityId: id, resource: 'acciones', delta: -1 });
      r.emit({ type: 'traitTriggered', entityId: id, rasgo: 'cosas-redondas', objetivoId: round.id } as WillyEvent);
      dealDamage(r, round.id, rng.die(4), 'golpe', id, 'cosas-redondas');
    }
  }
  return r.outcome();
}

/** «Siesta en la silla» (Socorrista): ending a turn without moving may put you to sleep. */
function onTurnEnd(ruleset: Ruleset, state: GameState, id: string, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id];
  if (!e || !standing(e) || !hasTrait(e, 'siesta-en-la-silla') || state.turn.movementUsed > 0) return r.outcome();
  const dif = hasTrait(e, 'tumbona-portatil') ? 6 : 10;
  if (!rollSave(r, id, 'agu', dif)) {
    r.apply({ type: 'applyCondition', entityId: id, condition: 'dormido', remainingTurns: 2 });
    r.emit({ type: 'traitTriggered', entityId: id, rasgo: 'siesta-en-la-silla' } as WillyEvent);
  }
  return r.outcome();
}

/** «Silencio absoluto» (Mimo): unnoticed when a fight starts. */
function onCombatStart(ruleset: Ruleset, state: GameState, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  // Companions catch up with Willy's level, and the ones that fell on another map are back.
  r.apply(...syncCompanions(state));
  for (const id of state.turn.order) {
    const e = state.entities[id];
    if (e && standing(e) && hasTrait(e, 'silencio')) r.apply({ type: 'applyCondition', entityId: id, condition: 'escondido' });
  }
  return r.outcome();
}

/** End of a fight: energy comes back (the «short rest»), one-per-combat things reset. */
function onCombatEnd(ruleset: Ruleset, state: GameState): ActionOutcome {
  const r = new Resolver(ruleset, state, null as never);
  for (const e of Object.values(state.entities)) {
    if (!standing(e)) continue;
    // «Pausa publicitaria»: makeup patches up Willy and his companion during the ads.
    const vida = e.resources.vida;
    if (vida && (hasTag(e, 'pc') || hasTag(e, 'companero')) && vida.current < vida.max) {
      r.apply({ type: 'modifyResource', entityId: e.id, resource: 'vida', delta: Math.min(vida.max - vida.current, Math.ceil(vida.max * WILLY.pausaPublicitaria.vida)) });
    }
    const en = e.resources.energia;
    if (en && en.current < en.max) r.apply({ type: 'modifyResource', entityId: e.id, resource: 'energia', delta: en.max - en.current });
    for (const c of ['cafe-tomado', 'corriendo', 'salto']) if (hasCondition(e, c)) r.apply({ type: 'removeCondition', entityId: e.id, condition: c });
  }
  // Summons and barriers go home when the fight is over.
  for (const e of Object.values(r.state.entities)) if (e.tags.some((t) => t.startsWith('invocado-por:'))) r.apply({ type: 'despawnEntity', entityId: e.id });
  return r.outcome();
}

/**
 * Things that look at every command's events (Ruleset.afterCommand): achievements, healing while
 * walking, the floor clock. Each registers here and they run in order, each seeing the state
 * left by the one before; their effects and events are all appended to the command's.
 */
type AfterCommandHook = (ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor) => ActionOutcome;

/** Registered hooks; `order` puts them in sequence (lower first). Plain pushes count as order 50. */
export const afterCommandHooks: AfterCommandHook[] = [];
const hookOrder = new Map<AfterCommandHook, number>();

/**
 * Register a look at every command (Ruleset.afterCommand). Order used so far: item drops 10,
 * worn items 20, the show (audience, sponsors) 50, health while exploring 60, achievements 100
 * (last, so they see everything the others announced).
 */
export function registerAfterCommand(hook: AfterCommandHook, order = 50): void {
  hookOrder.set(hook, order);
  afterCommandHooks.push(hook);
}

registerAfterCommand(dropsHook, 10);
registerAfterCommand(itemsHook, 20);
registerAfterCommand(showAfterCommand, 50);
registerAfterCommand(regenHook, 60);
registerAfterCommand(achievementsHook, 100);

/**
 * Runs the hooks in order. Each sees the state left by the ones before and the command's events
 * plus theirs; all their effects and events are appended to the command's.
 */
function afterCommand(ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  const out: ActionOutcome = { effects: [], events: [] };
  let current = state;
  const hooks = [...afterCommandHooks].sort((a, b) => (hookOrder.get(a) ?? 50) - (hookOrder.get(b) ?? 50));
  for (const hook of hooks) {
    const o = hook(ruleset, current, [...events, ...out.events], rng);
    if (!o.effects.length && !o.events.length) continue;
    current = applyEffects(ruleset, current, o.effects).state;
    out.effects.push(...o.effects);
    out.events.push(...o.events);
  }
  return out;
}

export const willy: Ruleset = {
  id: 'willy',
  version: 1,
  migrations: {},
  stats,
  resources,
  conditions,
  glossary,
  movement: { maxStep: 1, climbCost: 1 },
  movementBudget,
  resolveCheck,
  describeCheck,
  difficulty,
  dialogueConditions: {
    clase: (s, id, p) => classOf(s.entities[id]!) === p.is,
    atributoAlMenos: (s, id, p) => attr(s.entities[id]!, String(p.atributo) as Attr) >= Number(p.min),
    nivelAlMenos: (s, id, p) => level(s.entities[id]!) >= Number(p.min),
    habilidadAlMenos: (s, id, p) => skillLevel(s.entities[id]!, String(p.habilidad)) >= Number(p.min),
    rasgo: (s, id, p) => hasTrait(s.entities[id]!, String(p.is)),
  },
  commands: { ...showCommands, openBox: openBox as never, equipItem: equipItem as never, unequipItem: unequipItem as never },
  rollInitiative: (state, id, rng) => {
    const e = state.entities[id]!;
    const agi = hasTag(e, 'criatura') ? Math.floor(stat(e, 'ataque', 3) / 2) : attr(e, 'agi');
    // Ties go to Willy.
    return rng.die(20) + agi + (hasTag(e, 'pc') ? 0.5 : 0) + agi / 100;
  },
  canAct,
  // Barriers block tiles but do not count as anyone's side for ending a fight.
  isStanding: (e) => standing(e) && !hasTag(e, 'barrera'),
  occupiesTile: (e) => standing(e),
  onTurnStart: (state, id, rng) => onTurnStart(willy, state, id, rng),
  listActions,
  previewAction,
  performAction: (state, actorId, actionId, target, rng) => performAction(willy, state, actorId, actionId, target, rng),
  onCombatEnd: (state) => onCombatEnd(willy, state),
  onTurnEnd: (state, id, rng) => onTurnEnd(willy, state, id, rng),
  onCombatStart: (state, rng) => onCombatStart(willy, state, rng),
  surfaces: SURFACES,
  surfaceReactions: SURFACE_REACTIONS,
  onSurface: (state, id, surface, trigger, rng) => onSurface(willy, state, id, surface, trigger, rng),
  onFall: (state, id, levels, rng) => onFall(willy, state, id, levels, rng),
  onCollision: (state, id, hit, push, rng) => onCollision(willy, state, id, hit, push, rng),
  onVoid: (state, id, rng) => onVoid(willy, state, id, rng),
  onRoundEnd: (state, round, rng) => onRoundEnd(willy, state, round, rng),
  // For the AI: standing next to a gas barrel is asking for it (someone may blow it up).
  dangerAt: (state, _id, p) =>
    Object.values(state.entities).filter((e) => hasTag(e, 'explosivo') && standing(e) && Math.max(Math.abs(e.position.x - p.x), Math.abs(e.position.y - p.y)) <= 1).length * BARREL_BLAST * 0.35,
  noticeTrap: (state, id, trap) => noticeTrap(state, id, trap),
  triggerTrap: (state, id, trap, rng) => triggerTrap(willy, state, id, trap, rng),
  describeEntity: (state, id) => describeEntity(state, id, { conditions }),
  afterCommand: (state, events, rng) => afterCommand(willy, state, events, rng),
  itemSlot: itemSlotOf,
  equippedInSlot: equippedInSlotOf,
  equippedItems: equippedOnEntity,
  itemUse: itemUseOf as Ruleset['itemUse'],
};

setWillyRef(willy);

export { ATTRS, ATTR_LABELS, createCreature, createWilly, defence, skillLevel, type CreatureSpec, type WillySpec } from './character';
export { CLASSES } from './data';
export { WILLY_CREATION, buildWilly, defaultCreation } from './creation';
export { COMPANIONS, companionOfClass, companionStats, createCompanion, syncCompanions } from './companions';
export { MAX_LEVEL, XP_FOR_LEVEL, levelForXp, levelUpEffects } from './progression';
export { SURFACES } from './environment';
export * from './meta';
export { BAG, itemActionId, itemActions, slotOf, startingItemEffects } from './items';
export { grantItem, grantLootBox, rollBox } from './loot';
export { explorationHealing } from './regen';
export { HANDLERS, areaTiles } from './actions';
export type { AttackRolledEvent, DamageDealtEvent, WillyEvent } from './resolve';
export * as show from './show';
