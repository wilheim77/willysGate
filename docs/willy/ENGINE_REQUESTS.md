# Willy: peticiones al motor y al cliente

> Para la sesión principal. *Willy* no toca `engine/`, `src/` ni `rulesets/` compartidos: lo que necesita se pide aquí, **genérico**, para que sirva también a *Intereses* y al juego de vampiros.
> Estado: **propuesta** (2026-10-17). Cada petición indica qué, por qué, una API propuesta, la capa y la fase de *Willy* que la necesita (ver `DESIGN.md` → «Plan por fases»).

## Resumen

| # | Petición | Capa | Necesaria en | Sirve también a |
|---|---|---|---|---|
| R1 | Generador procedural de mapas por plantillas | `engine/procgen/` | W3 | Mazmorras opcionales de *Intereses*, vampiros |
| R2 | Reloj de acciones con eventos y umbrales | `engine/clock.ts` | W3 | Cualquier presión de tiempo (amanecer en vampiros) |
| R3 | Medidores con nombre (audiencia, afinidad) | `engine/meters.ts` | W4 | Reputación, Sed, sospecha |
| R4 | Patrones de evento y evaluador de condiciones | `engine/conditions.ts` | W4-W5 | Tutorial, diálogos, misiones |
| R5 | Narrador: plantillas con variables y selección sin repetir | `engine/narrator.ts` + `src/ui/` | W4 | Ladridos de compañeros en *Intereses* |
| R6 | Perfil por navegador (logros, desbloqueos, estadísticas) | `src/meta/` | W5 | Todos los juegos |
| R7 | Inventario, equipo y modificadores de stats | `engine/` (sistema) | W4 | *Intereses* (Fase 4) |
| R8 | Tablas de botín ponderadas y escena de recompensa | `engine/loot.ts` + `src/` | W4 | Cofres de *Intereses* |
| R9 | Flujo de escenas: inicio, prólogo, pausa, ajustes de partida | `src/` | W6 | Ya previsto en la Fase 6 |
| R10 | Cambio de mapa conservando entidades | `engine/` | W3 | *Intereses* (pueblo ↔ mina) |
| R11 | Eventos con causa y campos ricos | `engine/` + rulesets | W2 | Logros y tutorial de cualquier juego |
| R12 | RNG derivados por propósito | `engine/rng.ts` | W3 | Todos |
| R13 | Efectos adicionales, macros de ruleset e **invocaciones** (`spawnEntity` con dueño, controlador, duración e IA) | `engine/effects.ts` + IA | W2-W4 | Todos (refuerzos de jefes, invocaciones de clérigo en *Intereses*) |
| R14 | Capa `markers` en el cargador de Tiled | `engine/tiled.ts` | W3 | *Intereses* (interactuables) |
| R15 | **Salto** (mover ignorando `maxStep` y huecos dentro de un presupuesto) y **trazado con rebote** | `engine/pathfinding.ts` + `engine/los.ts` | W2 | Pícaros y monjes de *Intereses*, saltos de vampiros |

Ninguna mete reglas de *Willy* ni de d20 en `engine/`.

---

## R1. Generador procedural de mapas por plantillas

**Qué.** Un módulo puro y determinista que compone un `GridMap` a partir de **salas fijas** (Tiled, a mano), **plantillas** (Tiled, piezas) y **reglas** (JSON), y devuelve el mapa, el grafo de salas y los marcadores poblados.

**Por qué.** Las plantas de *Willy* son híbridas: inicio, escenas y jefe a mano; el resto, procedural. El generador no sabe nada de *Willy*: los roles, pesos y presupuestos son datos.

**Capa.** `engine/procgen/` (sin DOM, sin `Math.random`). La **población** con significado (qué enemigo cuesta qué) se hace con una función que aporta el contenido o el ruleset, o con datos genéricos de presupuesto (abajo).

### API propuesta

```ts
// engine/procgen/types.ts
export interface RoomTemplate {
  id: string;
  /** Size in cells (a cell is FloorSpec.cell tiles). */
  cells: { w: number; h: number };
  /** Parsed Tiled map of exactly cells.w*cell.w × cells.h*cell.h tiles. */
  map: GridMap;
  /** Door sockets: the centre of each side the template can open. */
  doors: Array<{ side: 'n' | 's' | 'e' | 'w'; cellOffset: number }>;
  markers: Marker[];                 // from the Tiled "markers" layer (R14)
  tags: string[];                    // roles: 'combat', 'treasure', 'trap', 'empty', 'boss'...
  weight: number;
  minDepth?: number;
  /** Horizontal flip allowed (vertical never: 3/4 walls are directional). */
  flipX?: boolean;
}

export interface Marker {
  type: string;                      // 'enemy' | 'chest' | 'trap' | 'light' | 'surface' | 'exit' | 'door' | 'mechanic' | ...
  pos: Vec2;                         // or rect
  rect?: { w: number; h: number };
  props: Record<string, JsonValue>;  // tier, chance, tags...
}

export interface FixedRoom {
  id: string;
  template: RoomTemplate;
  role: string;
  placement: 'pathStart' | 'pathEnd' | { pathIndex: number } | { pathFraction: [number, number] };
}

export interface FloorSpec {
  cell: { w: number; h: number };
  grid: { cols: number; rows: number };
  rooms: [number, number];           // total, min-max
  criticalPath: [number, number];
  branches: [number, number];
  loopChance: number;
  baseHeight: { min: number; max: number; maxStepBetweenRooms: number };
  corridorWidth: number;             // default 3
  fixed: FixedRoom[];
  roles: Record<string, { weight: number; branchesOnly?: boolean; neverTwiceOnPath?: boolean }>;
  templates: RoomTemplate[];
  /** Generic budget population: spend `budget(depth, role)` on spawn options by cost. */
  population?: PopulationSpec;
  movement: MovementRules;           // from the ruleset, for connectivity checks
  validators?: FloorValidator[];     // extra game rules (e.g. "walk distance ≤ 40 % of the clock")
  maxAttempts: number;               // default 20
}

export interface PopulationSpec {
  budget: { base: number; perDepth: number; roleMultiplier: Record<string, number> };
  spawns: Array<{ id: string; cost: number; weight: number; markerType: string; groupSize?: number }>;
  minDistanceFromStart: number;      // tiles
}

export interface GeneratedFloor {
  map: GridMap;
  rooms: Array<{ id: string; templateId: string; role: string; rect: Rect; depth: number; onCriticalPath: boolean; flipped: boolean }>;
  edges: Array<[string, string]>;
  markers: Marker[];                 // in map coordinates, populated (enemy markers carry the chosen spawn id)
  spawns: Record<string, Vec2>;      // 'start', 'exit'
  lights: LightSource[];
  attempt: number;
  generatorVersion: number;
}

export function generateFloor(spec: FloorSpec, seed: number): GeneratedFloor;
export type FloorValidator = (floor: GeneratedFloor) => true | string;   // string = reason, triggers retry
```

### Algoritmo
Descrito paso a paso en `DESIGN.md` → «Plantas híbridas y generación procedural»: rejilla de celdas → salas fijas → camino crítico (paseo aleatorio sin cruces) → ramas → bucles → roles → plantillas compatibles (tamaño, puertas, rol, profundidad, volteo) → pasillos rectos entre enchufes con rampas → población por presupuesto → validación → reintento.

### Cómo se cosen las salas fijas
- Una sala fija es una plantilla más con `placement` obligatorio. Se colocan **antes** del paseo aleatorio; el camino crítico se construye entre `pathStart` y `pathEnd` y las de `pathIndex`/`pathFraction` se insertan como nodos obligatorios.
- Sus puertas se respetan tal cual (si la fija solo abre al oeste, su vecina del camino crítico debe estar al oeste).
- Sus marcadores no se pueblan por presupuesto: llevan su contenido (enemigos concretos, PNJ) en las propiedades.

### Determinismo
- Todo el azar sale de un `RngCursor` sembrado con `seed` (R12). Reintento `n` usa `deriveSeed(seed, 'attempt', n)`.
- Iteraciones en orden estable (nunca sobre `Object.keys` de mapas con claves numéricas mezcladas sin ordenar).
- `generatorVersion` en la salida; el `GameState` guarda el mapa generado, no solo la semilla, para que una versión nueva no altere partidas guardadas.

### Garantías (validadores incluidos en el motor)
1. **Conectividad:** inundación desde `start` con `movement` → todas las puertas, marcadores `exit`, `chest` y salas alcanzables.
2. **Sin enemigos cerca del inicio** (`minDistanceFromStart`).
3. **Trampas evitables:** ningún marcador `trap` en un punto de articulación del grafo de casillas transitables.
4. **Rampas válidas** entre salas con distinta altura base.
Más los `validators` del juego. Si `maxAttempts` falla, lanza un error con las razones (el juego decide el respaldo).

### Tests que debería traer
Propiedades sobre 500 semillas con un `FloorSpec` de juguete (todas las garantías), reproducibilidad (misma semilla → mismo JSON), volteo correcto de puertas y marcadores, y una prueba con salas fijas en cada tipo de `placement`.

---

## R2. Reloj de acciones

**Qué.** Un contador por mapa que descuenta un coste por evento y emite eventos al cruzar umbrales y al llegar a cero.

**Por qué.** El reloj de planta de *Willy* (DESIGN §4). Es determinista y vive en el estado.

**Capa.** `engine/clock.ts`, estado en `state.systems.clock`.

```ts
export interface ClockState {
  id: string;
  remaining: number; total: number;   // in game seconds
  paused: boolean;
  warnings: number[];                  // percentages, e.g. [50, 25, 10]
  fired: number[];                     // warnings already emitted
}
export interface ClockCosts {
  /** Event type → cost, or a function of the event. */
  [eventType: string]: number | ((e: GameEvent, s: GameState) => number);
}
export function withClock(state: GameState, clock: ClockState): GameState;
/** Called by the engine after each command with the events it produced. */
export function tickClock(state: GameState, events: GameEvent[], costs: ClockCosts): { state: GameState; events: ClockEvent[] };
// Events: clockStarted, clockTicked {remaining}, clockWarning {pct}, clockExpired
// Effects: { type: 'addClock', seconds } ; { type: 'pauseClock', paused }
```

Lo que pasa al expirar (el derrumbe sala a sala) lo implementa el juego escuchando `clockExpired` y usando el grafo de salas de R1; la parte genérica es «cada N segundos más, emite `clockOvertime` con un contador», que *Willy* traduce en salas que caen.

---

## R3. Medidores con nombre

**Qué.** Valores numéricos globales (no de una entidad) con mínimo, máximo, umbrales con nombre y eventos al cruzarlos.

**Por qué.** La audiencia y la afinidad de los 6 patrocinadores. No son recursos de una entidad (`Entity.resources`) porque pertenecen a la partida.

**Capa.** `engine/meters.ts`, estado en `state.systems.meters`.

```ts
export interface Meter { id: string; value: number; min: number; max: number; floor?: number; thresholds?: Array<{ id: string; at: number }> }
// Effect: { type: 'modifyMeter', meter: string, delta?: number, pct?: number, cause?: string }
// Event:  meterChanged { meter, from, to, delta, cause } ; meterThresholdCrossed { meter, threshold, direction }
```

Las **reglas** que mueven los medidores (qué evento da cuánta audiencia, novedad, multiplicadores) son del juego: un pequeño sistema de reglas de datos encima de R4. Propongo que esa capa de reglas («event → effect con multiplicadores y novedad») sea genérica también, en `engine/rules.ts`, porque el tutorial y los patrocinadores la usan igual.

---

## R4. Patrones de evento y evaluador de condiciones

**Qué.** Un único lenguaje de datos para «este evento cumple esto» y «este estado cumple esto», con contadores por ámbito.

**Por qué.** Lo usan logros (90), gustos de patrocinadores, reglas de audiencia, pasos del tutorial y filtros del Narrador. Formato completo en `DESIGN.md` → «Logros» (`EventPattern`, `Match`, `Condition`, `Scope`).

**Capa.**
- Evaluación pura (`matchEvent(pattern, event)`, `evaluate(condition, ctx)`) en `engine/conditions.ts`.
- Contadores de ámbito `turno`/`combate`/`planta`/`partida` en `state.systems.counters` (se reinician con los eventos `turnEnded`, `combatEnded`, `floorExited`, `runEnded`).
- Contadores de ámbito `siempre` en el perfil (R6), porque son del navegador.
- `dato` resuelve rutas sobre un contexto que construye el juego (`willy.vidaPct`, `combate.enemigos`, `perfil.logros`…): el motor recibe un `resolve(path) → JsonValue`.

```ts
export function matchEvent(p: EventPattern, e: GameEvent): boolean;          // dotted paths, Match operators
export function evaluate(c: Condition, ctx: ConditionContext): boolean;
export interface ConditionContext { counters(scope, key): number; resolve(path: string): JsonValue; currentEvent?: GameEvent }
export function updateCounters(state, events, definitions): GameState;       // counts matches per scope
```

Los diálogos de la Fase 4 de *Intereses* pueden usar el mismo evaluador para sus condiciones genéricas.

---

## R5. Narrador: plantillas y selección

**Qué.** Un motor de frases: bancos por evento, plantillas con variables y concordancia de género, selección por especificidad, sin repetir, con probabilidad, prioridad y enfriamiento.

**Por qué.** El Narrador de *Willy* comenta todo (287 líneas ya escritas en `content/willy/narrator/`). *Intereses* puede usarlo para los comentarios de los compañeros.

**Capa.**
- **Selección en `engine/narrator.ts`**: pura, con un RNG propio del Narrador y la memoria anti-repetición en `state.systems.narrator`. Así es determinista, se guarda con la partida y no consume el RNG del combate.
- **Presentación en `src/ui/NarratorBox.ts`**: caja con máquina de escribir, «bla-bla» sintetizado, cola, historial y la preferencia de silenciar consejos.

```ts
export interface NarratorBank {
  id: string; evento: string; donde?: Record<string, Match>;
  probabilidad?: number; prioridad?: number;   // 1-5; 5 se encola, el resto se descarta si hay otra
  memoria?: number; enfriamientoTurnos?: number; despuesDe?: string;
  lineas: Array<{ id: string; texto: string; si?: Record<string, Match>; peso?: number }>;
}
export function narrate(state: GameState, events: GameEvent[], banks: NarratorBank[], vars: (e: GameEvent) => Record<string, TemplateValue>):
  { state: GameState; lines: Array<{ bankId: string; lineId: string; text: string; priority: number }> };

// Template: "{enemigo:el:Mayus} ha caído" with
type TemplateValue = string | number | { text: string; gender: 'm' | 'f'; plural?: boolean };
// Filters: el, un, del, al, o (o/a ending), Mayus. Unknown variable → dev error in tests, '…' at runtime.
```

**Selección:** líneas cuyo `si` se cumple → quedarse con las de más claves en `si` → quitar las usadas en las últimas `memoria` → elegir por peso. Tests: no repite dentro de la memoria, la más específica gana, concordancia de género correcta en las cuatro combinaciones.

Un test de contenido en *Willy* recorrerá todos los bancos y comprobará que cada variable usada existe para su evento.

---

## R6. Perfil por navegador

**Qué.** Almacenamiento persistente fuera de las partidas: logros, contadores `siempre`, desbloqueos, cosméticos, estadísticas y preferencias. Con versión y migraciones, exportable e importable.

**Por qué.** Los logros y los desbloqueos de *Willy* sobreviven a las partidas. Cualquier juego del repo querrá logros.

**Capa.** `src/meta/profile.ts` (usa `localStorage`; por eso no va en `engine/`). La lógica pura de desbloqueo (R4) recibe el perfil como dato.

```ts
interface Profile {
  version: number; gameId: string;
  achievements: Record<string, { unlockedAt: string; runSeed?: string }>;
  counters: Record<string, number>;        // 'siempre' scope
  unlocks: string[];                       // item ids
  cosmetics: string[];
  stats: Record<string, JsonValue>;        // races played, glossary read, intro views...
  prefs: { tips: boolean; reducedMotion: boolean; voice: boolean; textSpeed: number };
}
// Clave: `${gameId}:profile`. Escritura tras cada logro y al acabar cada combate.
// Export/import junto con las partidas en el mismo JSON.
```

Al empezar una partida, el juego copia al `GameState` lo que afecta a las reglas (objetos desbloqueados para el botín) para que la partida sea reproducible sin depender del perfil.

---

## R7. Inventario, equipo y modificadores

**Qué.** Inventario por entidad, ranuras de equipo definidas por el ruleset, objetos como datos y **modificadores de stats** con origen (equipo, condición, ventaja) que el motor suma al leer un stat.

**Por qué.** *Willy* tiene 78 objetos con efectos pasivos, disparadores e inmunidades. *Intereses* necesita inventario en su Fase 4.

**Capa.** `engine/` (sistema `inventory` en `state.systems`, o un campo nuevo de `Entity` si se prefiere con migración).

```ts
// Effects
{ type: 'addItem', entityId, itemId, qty? } ; { type: 'removeItem', entityId, itemId, qty? }
{ type: 'equip', entityId, itemId, slot } ; { type: 'unequip', entityId, slot }
// Modifiers
interface StatModifier { stat: string; delta: number; source: string }   // source: 'item:casco-de-obra'
export function effectiveStat(state, entity, stat): number;              // base + modifiers
// Triggered effects: the ruleset registers hooks (onHit, onTurnStart, onDamaged...) and reads item triggers from data.
```

Los efectos con significado (curar, dañar con elemento, inmunidades) siguen siendo del ruleset (R13).

---

## R8. Botín ponderado y escena de recompensa

**Qué.**
1. **`engine/loot.ts`:** tirada de tablas ponderadas anidadas con el RNG del estado, con garantía de rareza mínima, contadores de piedad en el estado, exclusión de repetidos y de únicos, y bajada de rareza si se agota.
2. **Escena de recompensa en el cliente** (`src/ui/RewardReveal.ts` + `src/fx/`): caída de la caja, temblor según el nivel, tapa, haz de luz y partículas del color de la rareza, cartas que se voltean, lluvia de monedas, «revelar todo», ×2, saltar y «animaciones reducidas». Colores y textos desde el contenido.

**Por qué.** Las cajas de *Willy* (DESIGN §8); los cofres de *Intereses* pueden usar la mitad 1.

```ts
interface LootTable { entries: Array<{ item?: string; table?: string; weight: number }> }
interface BoxSpec { slots: number; rarityWeights: Record<string, number>; guarantee?: string; coins?: [number, number]; table: string }
interface PityState { [rarity: string]: { sinceLast: number; threshold: number } }
export function rollBox(state, box: BoxSpec, ctx: { tables, items, owned, unlocked, pity }): { state; result: { items: string[]; coins: number; pityTriggered?: string } };
export function boxOdds(box, ctx): Array<{ item: string; pct: number }>;   // for "Ver probabilidades", no RNG
```

---

## R9. Flujo de escenas y ajustes de partida

Ya previsto en `docs/DESIGN.md` → «Introducción y onboarding». *Willy* lo necesita en W6, quizá antes que *Intereses*. Pide además:
- **`GameDefinition.cinematics`** con el reproductor de viñetas (formato de `INTRO.md`, campo `voice` y `fx` de paneo/partículas).
- **`GameDefinition.howToPlay`** (páginas) y **`glossary`** (secciones y términos) como datos.
- **`GameDefinition.feedbackUrl` opcional**: si no está definido, no hay botón (es el caso de *Willy* por decisión del usuario).
- **`GameDefinition.theme.titleFontFamily`**: segunda fuente para títulos y rótulos (*Willy*: Press Start 2P para títulos, VT323 para el texto).
- **`GameDefinition.saveMode`**: `'free'` (*Intereses*), `'checkpoint'` (*Willy* Con repetición: solo se guarda en zonas seguras, más un autoguardado de suspensión que se borra al cargarlo) o `'permadeath'` (*Willy* Sin repetición: una ranura propia, autoguardado tras cada comando, sin cargar ni exportar a mano, borrado al morir en la misma escritura que actualiza el perfil, y un contador de escrituras compartido con el perfil para detectar copias restauradas). El modo lo elige el jugador al empezar; el cliente lo lee de `GameState.settings.eliminationMode`.
- **`GameState.settings.difficulty`** (ya previsto) con valores definidos por el ruleset.
- Opción de cliente **«Animaciones reducidas»** respetada por `src/fx/`.

## R10. Cambio de mapa

`{ type: 'changeMap', map, spawns, keepEntities: string[], at: Record<id, Vec2> }`: sustituye `state.map`, conserva las entidades indicadas, borra el resto, reinicia superficies e iluminación del mapa y emite `mapChanged`. *Willy* lo usa en cada planta y en el Camerino; *Intereses*, entre el pueblo y la mina.

## R11. Eventos con causa

Para logros, audiencia y Narrador, los eventos de las Fases 2-3 deberían llevar:
- `entityDefeated { entityId, killerId?, cause, element?, weaponItemId?, movedBy? }` con `cause` ∈ `hit | fall | void | collision | surface | trap | object | collapse` (el juego mapea a sus nombres);
- `entityPushed { entityId, by, from, to, collidedWith?: 'wall' | 'entity' | 'object', into?: surfaceId | 'void' }`;
- `fell { entityId, levels, damage, pushedBy? }`;
- `attackResolved { actorId, targetId, hit, critical, natural, heightDelta, hitChance }`;
- `surfaceReacted { from, with, result, tiles, affected: string[] }`;
- `objectDestroyed { objectId, exploded, affected: string[] }`.

Mientras más rica la causa, menos lógica especial necesita cada logro.

## R12. RNG derivados

```ts
export function deriveSeed(seed: number, ...keys: (string | number)[]): number;   // hashSeed over a canonical join
```
Y el convenio de varios generadores en el estado: `rng` (reglas), `rngs.narrator`, `rngs.loot` (opcional). Así la generación de una planta, el Narrador y las cajas no cambian las tiradas de combate y al revés.

## R13. Efectos

Ya previstos: `push`, `spawnSurface`. *Willy* necesita además, genéricos:
- `addItem`, `removeItem` (R7);
- `modifyMeter` (R3), `addClock` (R2);
- `teleport { entityId, to, ignoreHeight? }`;
- `clearSurface { at, radius }`;
- `spawnEntity` y `despawnEntity`: ver abajo «Invocaciones».

### Invocaciones (`spawnEntity`), ampliado tras la decisión del usuario

El **Ingeniero** construye autómatas y antenas; el **Jugador de basket** pide tiempo muerto y aparece Chencho, el base; la Influencer invoca fans; el **Funcionario** y el Mimo crean barreras temporales (entidades-objeto sin controlador); los jefes llaman refuerzos. Hace falta algo más que «crear una entidad»:

```ts
type SpawnEntityEffect = {
  type: 'spawnEntity';
  template: string;                  // entity template id resolved by the game (content data → Entity)
  at: Vec2;                          // must be free and walkable; otherwise the command fails with 'blocked'
  id?: string;                       // deterministic default: `${template}#${state counter}`
  ownerId?: string;                  // summoner; kills and XP credited to the owner
  controllerId: string;              // 'player:1' (controlled summon), 'ai'...
  factionId: string;
  ai?: string;                       // AI profile id when controllerId is 'ai' ('torreta', 'agresivo'...)
  duration?: 'combat' | { turns: number } | 'permanent';
  maxPerOwner?: { key: string; max: number; onExceed: 'fail' | 'replaceOldest' };
  turnOrder?: 'afterOwner' | 'rollInitiative';   // summons in combat: act right after the owner, or roll
};
type DespawnEntityEffect = { type: 'despawnEntity'; entityId: string; reason: 'expired' | 'ownerDown' | 'combatEnded' | 'defeated' };
```

- **Estado:** `state.systems.summons = { [entityId]: { ownerId, expiresAtRound?, untilCombatEnd, key } }`. Serializable, con su RNG ya en el estado.
- **Turnos:** si `turnOrder: 'afterOwner'`, la invocación se inserta en la iniciativa justo detrás del dueño (y se quita al desaparecer). Si el dueño cae, sus invocaciones desaparecen (configurable por plantilla: `persistIfOwnerDown`).
- **Caducidad:** el motor emite `entityDespawned` al expirar por turnos (en `onTurnEnd` del dueño) o al terminar el combate; el render lo anima (plegarse, desvanecerse).
- **Atribución:** los eventos de daño y eliminación causados por una invocación llevan `ownerId`, para que logros, audiencia y XP los cuenten como del dueño.
- **Control:** una invocación con `controllerId: 'player:1'` acepta comandos del jugador como cualquier entidad (base del multijugador); con `'ai'` la mueve el sistema de IA de la Fase 2 con el perfil `ai`.
- **IA de autómatas y torretas:** perfiles genéricos en datos que la IA de la Fase 2 debería admitir: `agresivo` (ir al enemigo más cercano y atacar), `torreta` (no moverse; usar su acción contra el objetivo más cercano en alcance), `escolta` (quedarse a ≤ N casillas del dueño). El ruleset aporta las acciones disponibles (`listActions`).
- **Tests:** máximo por dueño, orden de turno, caducidad, desaparición al caer el dueño, atribución de eliminaciones, guardado y carga a mitad de combate con invocaciones activas.

Y un mecanismo para que el ruleset declare **macros** que se compilan a efectos del motor (`damage` → tirar dados, aplicar resistencias e inmunidades → `modifyResource`; `heal`; `revealFloor`). Propuesta: `ruleset.effectMacros: Record<string, (state, macro, rng) => Effect[]>`, que `applyEffects` expande antes de aplicar.

## R14. Capa `markers` en Tiled

`parseTiledMap` devuelve también `markers: Marker[]` de una capa de objetos `markers` (puntos y rectángulos, `type` = propiedad `type` o la clase del objeto en Tiled, y el resto de propiedades), además de las propiedades del mapa (`roles`, `minFloor`, `weight`, `cells`). Pequeño y útil para interactuables de *Intereses*.

## R15. Salto y trazado con rebote

**Qué.** Dos piezas genéricas de geometría y movimiento:

1. **Salto:** un movimiento que ignora `maxStep` y las casillas intermedias, dentro de un presupuesto.
2. **Trazado de proyectil con rebote:** una línea que se refleja en muros.

**Por qué.** El Jugador de basket de *Willy* salta fosos y cornisas, machaca desde arriba y rebota el balón en las paredes para esquivar la cobertura. El pathfinding actual (A* con `maxStep` y `climbCost`) no permite cruzar huecos ni subir más de `maxStep` de golpe, y la línea de visión de la Fase 3 no contempla rebotes. Las reglas concretas (cuánto salta, qué daño hace al aterrizar) son del ruleset; la geometría, del motor.

**Capa.** `engine/pathfinding.ts` (salto) y el módulo de línea de visión de la Fase 3 (rebote).

### Salto

```ts
export interface JumpRules {
  maxLength: number;      // tiles, measured along the jump line (Chebyshev or straight lines only — see `lines`)
  maxUp: number;          // levels it can rise, overriding movement.maxStep
  safeDown: number;       // levels it can drop without a fall event
  lines: 'straight' | 'any';   // 'straight' = the 8 grid directions only (what Willy needs)
  overEntities?: boolean; // may pass over occupied tiles (never land on them)
  blockedBy?: (tile: Tile, pos: Vec2) => boolean;  // e.g. low ceiling tiles block take-off/landing
}

/** Landing tiles reachable from `from` with one jump, with the height delta and whether it crosses a gap. */
export function jumpTargets(map: GridMap, from: Vec2, rules: JumpRules, occupied: ReadonlySet<string>):
  Array<{ to: Vec2; heightDelta: number; crossesGap: boolean; length: number }>;

// Effect (the ruleset decides when it is allowed and what it costs):
{ type: 'jump', entityId, to: Vec2, rules: JumpRules }
// Event:
jumped { entityId, from, to, heightDelta, crossesGap, length }
// If heightDelta < -safeDown, the engine emits `fell { levels: -heightDelta - safeDown, cause: 'jump' }`
// and the ruleset's onFall hook (planned in Phase 2-3) applies the damage.
```

- Un **hueco** es cualquier casilla no transitable o con `terrain: 'void'` / foso entre el origen y el destino.
- La trayectoria pasa «por encima» de las casillas intermedias: no activa trampas ni superficies en ellas, pero **sí** queda bloqueada por muros más altos que el punto más alto entre origen y destino + 1 (no se atraviesan paredes).
- **Techo bajo:** las casillas con la propiedad de Tiled `ceiling: 'low'` (leída en `parseTiledMap` como `Tile.ceiling?`) impiden despegar o aterrizar si `blockedBy` lo indica. Propongo añadir `ceiling?: 'low'` al `Tile` genérico (sin significado en el motor; lo interpreta el ruleset).
- La IA podrá usar `jumpTargets` para enemigos saltadores (vaquillas, ranas).
- **Tests:** cruzar un foso de 2, no cruzar uno de 3, subir 2 niveles con `maxUp: 2`, bloqueo por muro intermedio, techo bajo, caída tras bajar más de `safeDown`, determinismo.

### Trazado con rebote

```ts
/** Traces a projectile from `from` in direction `dir` (or towards `target`) up to `range` tiles,
 *  reflecting off wall tiles up to `maxBounces` times. Returns the tiles crossed and the first entity hit. */
export function traceProjectile(state: GameState, from: Vec2, toward: Vec2, opts: { range: number; maxBounces: number; stopAtEntities: boolean }):
  { path: Vec2[]; bounces: Vec2[]; hitEntityId?: string; endedAt: Vec2 };
// Event field for the attack: `rebotes: number` and `ignoresCover: boolean` (true after at least one bounce).
```

- Reflexión en cuadrícula: al entrar en una casilla muro, se invierte la componente del eje del muro (horizontal o vertical); en esquinas, ambas.
- Lo usa también la habilidad del Ingeniero «Arco voltaico» a nivel 3 (rebote en un autómata).
- **Tests:** rebote simple en muro vertical y horizontal, esquina, límite de rebotes, alcance total con rebotes, impacto con la primera entidad.

