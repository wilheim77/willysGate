import {
  type DialogueTree,
  type Entity,
  type JsonValue,
  type MapSetup,
  type SurfaceInstance,
  type TiledMapJson,
  type Trap,
  type Vec2,
  makeSurface,
  parseTiledMap,
  posKey,
  presenceTag,
  tileAt,
} from '../../engine';
import { SURFACES, createCharacter, createMonster, createProp } from '../../rulesets/dnd5e';
import abadia from './maps/abadia.json';
import calles from './maps/calles.json';
import camino from './maps/camino.json';
import escorial from './maps/escorial.json';
import mina from './maps/mina.json';
import boveda from './maps/boveda.json';
import plaza from './maps/plaza.json';
import castJson from './cast.json';
import templatesJson from './templates.json';
import spawnDialoguesJson from './spawn-dialogues.json';

/**
 * The act's places, built from their Tiled maps (DOM-free, so tests can use it too).
 * Spawn names decide what appears (see docs/MAPS.md):
 * - a cast.json id: that named character, with their dialogue;
 * - <template>-<n>: a generic creature from templates.json;
 * - barrel_oil/barrel/crate-<n>: scenery; chest/door/lever-<x>: usable, dialogue <kind>_<x>;
 * - entry-<from>: an arrival point; todo-<x>: a placeholder, nothing appears;
 * - hero/dorotea: the party, created by the game on the starting map only.
 */
export const ACT_MAPS: Record<string, TiledMapJson> = {
  camino: camino as TiledMapJson,
  plaza: plaza as TiledMapJson,
  abadia: abadia as TiledMapJson,
  calles: calles as TiledMapJson,
  escorial: escorial as TiledMapJson,
  mina: mina as TiledMapJson,
  boveda: boveda as TiledMapJson,
};

export const START_MAP = 'camino';
const PARTY_SPAWNS = new Set(['hero', 'dorotea']);
const AI = 'ai';

interface CastEntry {
  name: string;
  monsterId: string;
  spriteId: string;
  faction: string;
  noncombatant?: boolean;
  essential?: boolean;
  dialogue?: string | null;
  /** A different conversation on a given map (Cirilo at the trial vs. in his chapel). */
  dialogueByMap?: Record<string, string>;
}
interface Template {
  name: string;
  monsterId: string;
  spriteId: string;
  faction: string;
  noncombatant?: boolean;
}

const strip = <T>(o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('$'))) as Record<string, T>;
export const CAST = strip<CastEntry>(castJson);
export const TEMPLATES = strip<Template>(templatesJson);
const SPAWN_DIALOGUES = strip<string>(spawnDialoguesJson);

/** Companions met on the road: proper 5e characters, not monsters. Level 3, as the act starts. */
const COMPANIONS: Record<string, { classId: string; raceId: string; abilities: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number> }> = {
  garran: { classId: 'fighter', raceId: 'half_orc', abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 } },
  dorotea: { classId: 'rogue', raceId: 'human', abilities: { str: 8, dex: 15, con: 10, int: 14, wis: 12, cha: 13 } },
  anselmo: { classId: 'cleric', raceId: 'halfling', abilities: { str: 10, dex: 13, con: 14, int: 8, wis: 15, cha: 12 } },
};

export function companion(id: string, name: string, position: Vec2, controllerId: string, factionId: string, extraTags: string[] = []): Entity {
  const c = COMPANIONS[id]!;
  return createCharacter({ id, name, controllerId, factionId, position, spriteId: id, classId: c.classId, raceId: c.raceId, level: 3, abilities: { ...c.abilities }, extraTags });
}

function castEntity(id: string, c: CastEntry, position: Vec2, dialogues: Record<string, DialogueTree>, mapId: string): Entity {
  const script = c.dialogueByMap?.[mapId] ?? c.dialogue;
  const tags = [...(script && dialogues[script] ? [`dialogue:${script}`] : []), ...(c.noncombatant ? ['noncombatant'] : []), ...(c.essential ? ['essential'] : [])];
  if (COMPANIONS[id]) return companion(id, c.name, position, AI, c.faction, tags);
  return createMonster({ id, name: c.name, monsterId: c.monsterId === 'companion' ? 'commoner' : c.monsterId, controllerId: AI, factionId: c.faction, position, spriteId: knownSprites.has(c.spriteId) || !knownSprites.has(id) ? c.spriteId : id, extraTags: tags });
}

/** Sprite ids the art has, so a cast entry can fall back to its own id ("cirilo"). */
let knownSprites = new Set<string>();
export function useSprites(ids: Iterable<string>): void {
  knownSprites = new Set(ids);
}

const PROP_KINDS = new Set(['barrel_oil', 'barrel', 'crate']);
/** Art props placed as spawns: which object rules they follow, and whether they block the way. */
const ART_PROPS: Record<string, { kind: 'powder_keg' | 'wagon' | 'resonator' | 'decor'; name: string; obstacle: boolean }> = {
  powder_keg: { kind: 'powder_keg', name: 'Barril de pólvora', obstacle: true },
  mine_wagon: { kind: 'wagon', name: 'Vagoneta', obstacle: true },
  mine_wagon_ore: { kind: 'wagon', name: 'Vagoneta cargada', obstacle: true },
  resonator: { kind: 'resonator', name: 'Resonador', obstacle: true },
  oil_cart: { kind: 'decor', name: 'Carro de aceite', obstacle: true },
  well: { kind: 'decor', name: 'Pozo', obstacle: true },
  gallows: { kind: 'decor', name: 'Horca', obstacle: true },
  campfire: { kind: 'decor', name: 'Hoguera', obstacle: true },
  tapestry: { kind: 'decor', name: 'Tapiz', obstacle: false },
  tapestry_crossbow: { kind: 'decor', name: 'Tapiz', obstacle: false },
  fuse_charges: { kind: 'decor', name: 'Cargas y mecha', obstacle: false },
  remains_forty: { kind: 'decor', name: 'Restos', obstacle: false },
  pulley: { kind: 'decor', name: 'Polea', obstacle: false },
  inscription: { kind: 'decor', name: 'Inscripción', obstacle: false },
};
const USABLE_KINDS = new Set(['chest', 'door', 'lever']);

/** One map, as it is the first time anyone arrives. */
export function buildMap(mapId: string, dialogues: Record<string, DialogueTree>): MapSetup {
  const json = ACT_MAPS[mapId];
  if (!json) throw new Error(`Unknown map "${mapId}"`);
  const { map, spawns, lighting, zones, spawnProperties } = parseTiledMap(mapId, json);
  const entities: Entity[] = [];
  for (const [name, position] of Object.entries(spawns)) {
    if (name.startsWith('entry-') || name.startsWith('todo-') || PARTY_SPAWNS.has(name)) continue;
    const cast = CAST[name];
    if (cast) {
      entities.push(castEntity(name, cast, position, dialogues, mapId));
      continue;
    }
    const dash = name.lastIndexOf('-');
    const kind = dash > 0 ? name.slice(0, dash) : name;
    const rest = dash > 0 ? name.slice(dash + 1) : '';
    if (PROP_KINDS.has(kind)) {
      entities.push(createProp({ id: name, kind: kind as 'barrel_oil' | 'barrel' | 'crate', position }));
      continue;
    }
    const artProp = ART_PROPS[kind];
    if (artProp && rest) {
      // A usable art prop (the pulley) gets its script like levers do: <kind>_<n>.
      const script = `${kind}_${rest}`;
      const tags = [...(dialogues[script] ? [`dialogue:${script}`] : [])];
      const prop = createProp({ id: name, kind: artProp.kind, position, spriteId: kind, name: artProp.name, extraTags: tags });
      entities.push(artProp.obstacle ? prop : { ...prop, tags: prop.tags.filter((t) => t !== 'obstacle') });
      continue;
    }
    const usable = name.split('-')[0]!;
    if (USABLE_KINDS.has(usable)) {
      const script = `${usable}_${name.slice(usable.length + 1).replace(/-/g, '_')}`;
      // Doors nobody wrote a script for still open (door_default).
      const tree = dialogues[script] ? script : usable === 'door' && dialogues.door_default ? 'door_default' : null;
      const tags = tree ? [`dialogue:${tree}`] : [];
      const sprite = usable === 'door' ? 'none' : usable === 'lever' ? 'lever' : 'chest';
      entities.push(createProp({ id: name, kind: usable as 'chest' | 'door' | 'lever', position, spriteId: sprite, extraTags: usable === 'lever' ? [...tags, 'pose:up'] : tags }));
      continue;
    }
    // <template>-<n>, or a lone <template> (the only sergeant on the map).
    const t = TEMPLATES[kind] ?? TEMPLATES[name];
    if (t && (rest || TEMPLATES[name])) {
      entities.push(createMonster({ id: name, name: t.name, monsterId: t.monsterId, controllerId: AI, factionId: t.faction, position, spriteId: t.spriteId, extraTags: t.noncombatant ? ['noncombatant'] : [] }));
      continue;
    }
    // Unknown spawn names are content bugs; the map test reports them, the game skips them.
  }

  // Story-conditional spawns (the night attackers at the abbey gate): present only when the flags say.
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    const p = spawnProperties[e.id];
    if (!p || !(p.requiresFlag || p.unlessFlag || p.requiresAnyFlag)) continue;
    const presence = {
      ...(p.requiresFlag ? { requiresFlag: String(p.requiresFlag) } : {}),
      ...(p.unlessFlag ? { unlessFlag: String(p.unlessFlag) } : {}),
      ...(p.requiresAnyFlag ? { requiresAnyFlag: String(p.requiresAnyFlag).split(',').map((f) => f.trim()).filter(Boolean) } : {}),
    };
    entities[i] = { ...e, tags: [...e.tags, presenceTag(presence)] };
  }
  // Spawn-specific scripts (a Callado who talks, a well you can lower yourself into).
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    const script = SPAWN_DIALOGUES[`${mapId}:${e.id}`];
    if (script && dialogues[script]) entities[i] = { ...e, tags: [...e.tags.filter((t) => !t.startsWith('dialogue:')), `dialogue:${script}`] };
  }
  const surfaces: Record<string, SurfaceInstance> = {};
  const traps: Trap[] = [];
  for (const z of zones) {
    const tiles = Array.from({ length: z.width * z.height }, (_, i) => ({ x: z.x + (i % z.width), y: z.y + Math.floor(i / z.width) }));
    if (z.layer === 'surfaces' && SURFACES[String(z.properties.surface)]) {
      for (const t of tiles) if (tileAt(map, t)?.walkable) surfaces[posKey(t)] = makeSurface(SURFACES, String(z.properties.surface));
    }
    if (z.layer === 'traps') {
      const { disarmCheck, disarmDc, ...params } = z.properties;
      traps.push({
        id: `${mapId}:${z.name}`,
        tiles,
        hidden: true,
        armed: true,
        params,
        ...(disarmCheck ? { disarm: { check: String(disarmCheck), dc: Number(disarmDc ?? 12), triggerOnFailBy: 5 } } : {}),
      });
    }
  }
  return {
    map,
    entities,
    spawns,
    systems: {
      lighting: lighting as unknown as JsonValue,
      zones: zones as unknown as JsonValue,
      surfaces: surfaces as unknown as JsonValue,
      traps: traps as unknown as JsonValue,
    },
  };
}
