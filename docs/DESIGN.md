# Diseño técnico

> Documento vivo. Describe cómo está construido el proyecto y por qué. La historia está en `STORY.md` y el encargo original en `BRIEF.md`.

## Objetivo de la arquitectura

El mismo código debe servir para **varios juegos**: *Intereses* (5e simplificado) y, más adelante, otros con su propia ambientación y sus propias reglas, como uno de cazadores de vampiros con Sed, Fe y Luz. También debe poder convertirse en **multijugador por turnos** (hotseat y después asíncrono) sin reescribir el núcleo.

Un juego nuevo debería consistir en un guion, un ruleset (heredado o nuevo) y una carpeta de contenido. Nada más. Ver `NEW_GAME.md`.

## Capas

```
engine/            Motor genérico. TS puro, sin DOM, sin Phaser, sin reglas de ningún juego.
rulesets/common/   Piezas de reglas reutilizables (convenciones d20, ventaja/desventaja...).
rulesets/dnd5e/    5e simplificado (SRD 5.1). Implementa la interfaz Ruleset.
content/<juego>/   game.ts, meta.json, mapas Tiled, textos, manifiesto de assets, public/ (arte).
src/               Cliente genérico: render isométrico (Phaser 3), input, HUD. Lee la definición del juego.
tests/             Vitest. engine/ se prueba con un ruleset de juguete que no es D&D.
```

### Reglas de dependencia

Las hace cumplir `tests/architecture.test.ts`:

| Capa | Puede importar |
|---|---|
| `engine/` | solo `engine/` |
| `rulesets/` | `engine/` y `rulesets/` |
| `content/<juego>/` | `engine/`, `rulesets/` y tipos de `src/` |
| `src/` | todo, y el juego activo mediante el alias `@game` |

Además, `engine/` y `rulesets/` no pueden usar `window`, `document`, `localStorage`, `Math.random`, `Date.now` ni `crypto`, para que todo sea determinista y pueda ejecutarse en un servidor. Cada capa tiene un `tsconfig` sin tipos del DOM.

## Qué sabe el motor y qué no

**Sabe de:** la cuadrícula, la altura, el pathfinding, las entidades, los turnos, los comandos, el RNG, los efectos genéricos, las pruebas (como interfaz), el guardado y la carga, y la carga de mapas de Tiled.

**Más adelante sabrá de:** la línea de visión, las superficies, las interrupciones o reacciones, los diálogos, la base de la IA y la iluminación.

**No sabe qué es:** una CA, un espacio de conjuro, un d20, la ventaja, una clase, una raza, la Sed o la Fe.

### Entidad

```ts
Entity {
  id, name, controllerId, factionId, position, spriteId,
  stats:      Record<string, number>          // { str: 15, speed: 6, ac: 14 } en 5e
  resources:  Record<string, {current, max}>  // { hp, action, spell_slot_1 } en 5e; { thirst, faith } en vampiros
  conditions: { id, sourceId?, remainingTurns? }[]
  tags:       string[]                        // 'class:wizard', 'race:elf', 'prof:persuasion'
}
```

- El motor nunca interpreta las claves: su significado lo define el ruleset (`stats`, `resources` y `conditions` con sus etiquetas en castellano).
- `controllerId` y `factionId` pueden cambiar durante la partida, porque un compañero puede abandonar el grupo o volverse enemigo.

### GameState

Es un único objeto serializable en JSON:
- `gameId`, `rulesetId`, `rulesetVersion` y `schemaVersion`;
- la semilla y el **estado completo del RNG** (sfc32);
- el mapa, las entidades, los flags y el turno;
- `systems`: un espacio reservado para el estado de los sistemas del motor que vayan llegando (superficies, iluminación…). Añadir un sistema no cambia la forma del resto del estado.

### Comandos y eventos

- Toda acción es un comando, `{ type, issuer, ... }`. `engine.apply(state, cmd)` valida y devuelve `{ ok, state, events }` o `{ ok: false, error: { code } }`. Es una función pura: nunca modifica el estado que recibe.
- El motor trae sus comandos genéricos (`move`) y el ruleset registra los suyos en `ruleset.commands` (`attack`, `castSpell`, `drinkBlood`…). Si un ruleset intenta redefinir un comando del motor, falla al arrancar.
- `issuer` tiene que coincidir con el `controllerId` de la entidad. Es la base del multijugador: el servidor (o el turno de hotseat) solo acepta comandos del controlador correcto.
- Los eventos (`entityMoved`, `resourceChanged`, `conditionApplied`…) son la única información que recibe el render para animar.
- Los códigos de error son genéricos y el texto que se muestra al jugador está en `content/<juego>/texts/ui.json`.

### Efectos

Las reglas no tocan el estado directamente: producen **efectos genéricos** que aplica el motor (`engine/effects.ts`):

| Efecto | Qué hace |
|---|---|
| `modifyResource` | Suma o resta a un recurso. Siempre queda entre 0 y el máximo. |
| `applyCondition` | Aplica una condición. Si ya estaba, la renueva en lugar de acumularla. |
| `removeCondition` | Quita una condición. |
| `setFlag` | Cambia un flag de historia. |
| Planificados (Fase 3) | `push`, `spawnSurface`, `damageObject`. |

Por ejemplo, en 5e, «7 de daño de fuego con resistencia» lo calcula el ruleset y llega al motor como `modifyResource hp -3`.

### Pruebas (checks)

```ts
engine.check(state, { actorId, check: 'persuasion', target: 14, situational: ['high_ground'] })
  -> { state (RNG avanzado), result: CheckResult }
```

`CheckResult` es un desglose genérico: dados (`sides`, `rolls`, `kept`, `note`), modificadores con su etiqueta, total, objetivo, etiqueta del objetivo («CD», «Umbral»…) y si ha tenido éxito. La interfaz pinta «[Persuasión] d20 (12) + 3 Carisma + 2 Competencia = 17 vs CD 14 — ÉXITO» sin saber qué es un d20. Un ruleset de 2d6 se pinta igual.

## Interfaz `Ruleset`

Definida en `engine/ruleset.ts`:

| Miembro | Para qué |
|---|---|
| `id`, `version`, `migrations` | Identificar el ruleset y migrar las partidas guardadas cuando cambian sus datos |
| `stats`, `resources`, `conditions` | Declarar qué existe, con etiquetas en castellano. Los recursos indican cuándo se reponen (`turn`, `shortRest`, `longRest` o `never`) y si se muestran como barra. |
| `movement` | Reglas de altura: cuántos niveles se pueden subir o bajar de un paso y cuánto cuesta trepar |
| `movementBudget(entity, state)` | Cuánto puede moverse una entidad en un turno de combate |
| `resolveCheck(state, req, rng)` | Cómo se resuelve una prueba o tirada de salvación |
| `difficulty(state, entityId, source)` | Cómo se calcula una CD, por ejemplo la de los conjuros |
| `dialogueConditions` | Condiciones que los diálogos pueden pedir (`class`, `race`, `abilityAtLeast`, `proficient`…) |
| `commands` | Acciones propias del ruleset, como atacar o lanzar un conjuro (llegan en la Fase 2) |

`extendRuleset(base, ext)` crea un ruleset derivado sin copiarlo entero. Un juego puede añadir sus propias condiciones (como «embelesado» en *Intereses*) o un ruleset de vampiros puede partir de `dnd5e` y añadir Sed y Fe.

**Ganchos previstos**, que se añadirán a la interfaz en las fases correspondientes:

| Gancho | Fase |
|---|---|
| `rollInitiative` y `onTurnStart` / `onTurnEnd` (recarga de los recursos `turn`, duración de las condiciones) | 2 |
| `onFall` (daño por caída) | 2-3 |
| Reacciones a interrupciones del motor (ataque de oportunidad al salir de una casilla adyacente) | 2 |
| `listActions` y puntuación para la IA | 2 |
| Modificadores por luz u oscuridad | Cuando exista el sistema de iluminación |

Si alguno de estos ganchos obligara a meter lógica de 5e en `engine/`, se avisará antes de implementarlo.

## Sistemas del motor previstos

- **Superficies (Fase 3).**
  - Una capa por casilla en `state.systems.surfaces`.
  - Los tipos de superficie y sus reacciones son **datos**, por ejemplo `oil + fire -> burning` o `water + lightning -> electrified`, definidos por el ruleset o por el contenido.
  - El motor ejecuta las reacciones y emite eventos.
  - Lo que hace cada superficie a quien la pisa (daño, resbalar…) se traduce a efectos genéricos.
- **Línea de visión y cobertura (Fase 3):** se calculan con la geometría de la cuadrícula y la altura, de forma genérica.
- **Iluminación (futuro).**
  - Fuentes de luz como entidades o objetos de mapa con un radio.
  - Un estado por casilla en `state.systems.lighting`, calculado reutilizando la línea de visión, y una consulta `lightAt(pos)`.
  - El ruleset decide qué significa la oscuridad (desventaja, Sed…).
  - No requiere cambiar ninguna otra parte del motor.
- **Diálogos (Fase 4).**
  - Árboles en JSON con un esquema validado.
  - Condiciones genéricas del motor (flags, objetos) más las del ruleset (`dialogueConditions`).
  - Los nodos de prueba piden `{ check, target }` y la interfaz muestra el `CheckResult`.
- **Interrupciones (Fase 2):** el motor puede pausar un comando en ciertos puntos (por ejemplo, salir de una casilla adyacente a un enemigo) y ofrecer reacciones, pero no sabe cuáles existen.

## Cliente (`src/`)

- **Definición del juego.** `content/<juego>/game.ts` exporta un `GameDefinition` (`src/game/definition.ts`): ruleset, manifiesto de assets, tema visual (colores y fuente), textos de la interfaz, `playerId`, `leaderId` y `newGame()`.
- **Selección del juego.** Vite resuelve el alias `@game` a `content/$GAME/game.ts`. El valor por defecto es `intereses`.
- **Estado.** `GameStore` guarda el `GameState` y solo cambia mediante `dispatch(cmd)` o `load(state)`. Avisa a la escena y al HUD con los eventos.
- **`MapScene` (Phaser).**
  - Pinta el mapa isométrico con altura y ordena el dibujo por profundidad.
  - Anima los eventos.
  - Convierte el clic o el toque en la selección de una casilla.
  - Muestra la ruta prevista al pasar el ratón.
  - Permite arrastrar para desplazar la cámara y hacer zoom con la rueda o pellizcando.
- **Assets.** El manifiesto de cada juego (`content/<juego>/assets/manifest.json`) asocia terrenos y `spriteId` con archivos. Para cambiar de pack gráfico solo hay que tocar el manifiesto. Las entradas `placeholder` se dibujan en tiempo de ejecución.
- **Guardado.** Usa `localStorage` con una clave por juego. La exportación y la importación usan JSON. Al cargar se comprueban el juego, el ruleset y las versiones, y se aplican las migraciones necesarias.

## Mapas (Tiled)

- **Formato:** mapa isométrico de 64×32, con los tilesets incrustados en el JSON.
- **Capa `ground`:** un tile por casilla. Cada tile del tileset tiene las propiedades `terrain` (string), `height` (int) y `walkable` (bool).
- **Capa de objetos `spawns`:** objetos punto cuyo nombre es el id del punto de aparición.
- **Pendiente:** capas de superficies, interactuables y zonas de luz, cuando lleguen sus sistemas.

## Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Movimiento en 8 direcciones con coste 1 en diagonal (5e) y sin atajar esquinas | Simple y legible |
| Subir un nivel cuesta 1 movimiento extra; un desnivel de 2 o más corta el paso a pie | Saltar o trepar será una acción aparte. Configurable en `ruleset.movement`. |
| RNG sfc32 con su estado completo dentro del `GameState` | Partidas reproducibles y tiradas auditables |
| Un solo paquete npm, sin workspaces | Menos complejidad. Las fronteras se hacen cumplir con `tsconfig` y tests. |
| Phaser 3.90 | Pedido en el encargo. Phaser 4 existe, pero no aporta nada necesario ahora. |
| Varios juegos en un repo, desplegados en `/willysGate/<juego>/` con una portada en `/willysGate/` | Cada juego tiene su URL sin duplicar el motor |
