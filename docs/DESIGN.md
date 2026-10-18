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

**Combate (Fase 2, hecho).** La interfaz incluye:
- `rollInitiative`, `canAct`, `isStanding`, `onTurnStart` y `onCombatEnd`;
- `listActions`, `previewAction` (sin tirar dados: probabilidad, daño o curación esperados, desglose con `term` y `affectedTiles`) y `performAction`;
- `onLeaveReach` (interrupción para el ataque de oportunidad);
- `glossary`, y el rol `health` en los recursos.

El motor gestiona:
- los comandos `startCombat` (solo `system`), `endTurn` y `act`;
- el orden de iniciativa, la recarga de recursos `turn` y la duración de las condiciones;
- el movimiento por turno, con interrupciones;
- el fin de combate;
- una **IA genérica** (`engine/ai.ts`) que puntúa la vista previa del ruleset desde cada casilla alcanzable, con pesos configurables (`AiProfile`).

**Ganchos previstos**, que se añadirán a la interfaz en las fases correspondientes:

| Gancho | Fase |
|---|---|
| `onFall` (daño por caída) | 3 |
| Modificadores por luz u oscuridad | Cuando exista el sistema de iluminación |

Si alguno de estos ganchos obligara a meter lógica de 5e en `engine/`, se avisará antes de implementarlo.

## Sistemas del motor previstos

- **Superficies (Fase 3).**
  - Una capa por casilla en `state.systems.surfaces`.
  - Los tipos de superficie y sus reacciones son **datos**, por ejemplo `oil + fire -> burning` o `water + lightning -> electrified`, definidos por el ruleset o por el contenido.
  - El motor ejecuta las reacciones y emite eventos.
  - Lo que hace cada superficie a quien la pisa (daño, resbalar…) se traduce a efectos genéricos.
- **Línea de visión y cobertura (Fase 3):** se calculan con la geometría de la cuadrícula y la altura, de forma genérica.
- **Iluminación (base hecha; ampliación en Fase 3).**
  - `engine/lighting.ts`. Las fuentes de luz pueden ser fijas (antorchas, braseros) o ir con una entidad (`attachedTo`, como la linterna del cobrador). Cada una tiene radio, intensidad y, solo para el render, color y parpadeo.
  - El estado se guarda en `state.systems.lighting`, junto con la luz ambiente.
  - Consulta: `lightLevelAt(state, pos)`, de 0 a 1. El ruleset decide qué significa la oscuridad (desventaja, Sed, la Luz del juego de vampiros…).
  - Los mapas declaran sus luces en la capa de objetos `lights` de Tiled, y la luz ambiente en la propiedad `ambientLight`.
  - Fase 3: la luz quedará bloqueada por muros (con la línea de visión) y las superficies de fuego serán fuentes de luz.
- **Diálogos (Fase 4).**
  - Árboles en JSON con un esquema validado.
  - Condiciones genéricas del motor (flags, objetos) más las del ruleset (`dialogueConditions`).
  - Los nodos de prueba piden `{ check, target }` y la interfaz muestra el `CheckResult`.
- **Interrupciones (Fase 2):** el motor puede pausar un comando en ciertos puntos (por ejemplo, salir de una casilla adyacente a un enemigo) y ofrecer reacciones, pero no sabe cuáles existen.

## Cliente (`src/`)

- **Definición del juego.** `content/<juego>/game.ts` exporta un `GameDefinition` (`src/game/definition.ts`): ruleset, manifiesto de assets, tema visual (colores y fuente), textos de la interfaz, `playerId`, `leaderId` y `newGame()`.
- **Selección del juego.** Vite resuelve el alias `@game` a `content/$GAME/game.ts`. El valor por defecto es `intereses`.
- **Estado.** `GameStore` guarda el `GameState` y solo cambia mediante `dispatch(cmd)` o `load(state)`. Avisa a la escena y al HUD con los eventos.
- **`MapScene` (Phaser), vista cenital 3/4.**
  - Cuadrícula ortogonal. El tamaño de tile lo fija el preset de arte (16 px en 0x72, 32 px en LPC). El zoom se expresa en píxeles de pantalla por tile, así que funciona igual con cualquier pack.
  - **Altura:** cada nivel sube la casilla `levelHeight` píxeles y muestra debajo una cara de acantilado o de muro. El orden de dibujo es por fila y, dentro de la fila, por altura.
  - **Legibilidad de la altura:** borde oscuro donde el terreno cae, sombra degradada donde la casilla vecina por el norte o el oeste es más alta (la luz viene del noroeste) y «altura N» en la barra inferior.
  - **Personajes:**
    - Sprites de **2 direcciones** con volteo horizontal (0x72), o de 4 direcciones (LPC), según el preset.
    - Pivote en los pies.
    - Sombra de contacto dibujada por código.
    - Reposo con la animación idle del pack o, si no la tiene, el frame de pie con una respiración sutil.
  - Al pasar el ratón muestra la ruta prevista. Se arrastra para desplazar la cámara y se hace zoom con la rueda o pellizcando. Un toque solo cuenta como orden de movimiento si fue un único dedo que no se desplazó.
  - **Iluminación:** `src/fx/LightingLayer.ts` pinta el estado de luz del motor. Es una capa de oscuridad con agujeros suaves por cada luz, un brillo aditivo de color y llama visible en las luces fijas. El parpadeo es solo visual.
  - **Corrección de color:** filtro de cámara (`postFX.addColorMatrix`) con saturación, brillo y tinte, configurable por preset de arte.
- **Presets de arte.** `GameDefinition.art` contiene varios manifiestos intercambiables (`content/<juego>/assets/<preset>.json`). `?arte=<preset>` en la URL elige uno, lo que sirve para comparar packs sobre el mismo mapa.
- **Guardado.** Usa `localStorage` con una clave por juego. La exportación y la importación usan JSON. Al cargar se comprueban el juego, el ruleset y las versiones, y se aplican las migraciones necesarias.

## Introducción y onboarding (planificado para la Fase 6)

Público objetivo: amigos que no conocen D&D ni el proyecto. Tienen que poder jugar **sin que nadie les explique nada**.

### Piezas

| Pieza | Descripción | Dónde vive |
|---|---|---|
| **Pantalla de inicio** | Título, subtítulo con gancho, «Nueva partida», «Continuar» (solo si hay guardado) y «Cómo se juega». Es lo primero que se ve al abrir la URL de Pages. | Escena `TitleScene` del cliente. Los textos vienen de `content/<juego>/`. |
| **Prólogo cinemático** | 1-2 minutos de viñetas en pixel art con texto, al estilo de los juegos retro. Se puede saltar y repetir desde el menú. Sitúa el mundo, el conflicto y por qué el protagonista está metido en el lío. Tono Abercrombie desde la primera línea. | Datos en `content/<juego>/cinematics/*.json` (viñetas: imagen, texto, duración) y un reproductor genérico en el cliente. El guion va como anexo en `STORY.md`. |
| **Tutorial integrado** | El primer encuentro presenta cada mecánica la primera vez que aparece: moverse, atacar, acción adicional, ventaja, altura, empujar, superficies y tiradas de diálogo. Mensajes breves y con el tono del juego, sin pantallas de manual. **Ninguna mecánica aparece sin haberse explicado antes.** | Pasos de tutorial como datos en `content/<juego>/tutorial.json` (disparador, texto, condición). Un sistema genérico del cliente los muestra. |
| **Tooltips de jerga** | Al pasar el ratón o tocar sobre CA, CD, ventaja, tirada de salvación o el % de acierto, se explica en lenguaje llano. **El % de acierto se muestra antes de atacar.** | Glosario aportado por el ruleset y ampliable por el contenido, más un componente genérico de tooltip. |
| **Glosario** | En el menú de pausa: reglas, superficies y condiciones. | El mismo glosario. |
| **Consejos contextuales** | Se pueden desactivar. | Preferencia del navegador (`localStorage`), no del `GameState`. |
| **Dificultad «Historia»** | Para quien solo quiere ver la trama. | Ajuste guardado en la partida. El ruleset decide qué cambia. |
| **Botón de feedback** | Opcional: formulario o `mailto`, para reportar bugs o cosas que no se entienden. | URL configurable en `GameDefinition`. Ninguna dirección queda fija en el código. |
| **Guardado por navegador** | Cada amigo tiene el suyo. | Ya funciona: `localStorage` con una clave por juego. |

**Antes de cerrar la Fase 6:** revisar el juego como un jugador nuevo que nunca ha jugado a D&D y listar cada punto en el que se perdería.

### Qué implica para la arquitectura

Nada de esto obliga a meter reglas de 5e en `engine/`. Sí conviene preparar estas piezas genéricas **cuando se construyan las mecánicas** (Fases 2-4), para no tener que reabrirlas en la Fase 6:

1. **Eventos para todo.** Cada mecánica emite un evento propio cuando ocurre (`combatStarted`, `attackResolved`, `entityPushed`, `surfaceCreated`, `fell`, `checkRolled`…). El tutorial se engancha a esos eventos, que ya son la vía por la que se entera el render.
2. **Vista previa sin tirar dados.** Un método del ruleset del tipo `preview(state, action)` devuelve la probabilidad de acierto y el desglose (CA del objetivo, modificadores, ventaja) **sin consumir el RNG**. Es lo que pinta el «% de acierto» antes de atacar, y la IA también lo usará para evaluar objetivos. Se añadirá a la interfaz `Ruleset` en la Fase 2.
3. **Términos enlazados al glosario.** Los desgloses (`CheckResult` y la vista previa) llevarán en cada modificador y en el objetivo un `term` opcional (`'ac'`, `'dc'`, `'advantage'`…) que apunte al glosario. Así cualquier número de la interfaz puede tener tooltip. El ruleset aporta un `glossary` con textos en lenguaje llano y el contenido puede ampliarlo con superficies y términos propios.
4. **Ajustes de partida en el estado.** `GameState` tendrá un `settings` serializable (por ejemplo, `difficulty: 'story' | 'normal'`) que el ruleset lee. Solo afecta a las reglas, sin campos fijos en el motor.
5. **Progreso del tutorial en la partida.** Los pasos ya mostrados se guardan como flags con espacio de nombres (`tutorial:attack`…). Si se empieza una partida nueva, el tutorial vuelve a salir. La preferencia de desactivar consejos es del navegador.
6. **Escenas del cliente.** `main.ts` dejará de arrancar directamente en el mapa: habrá un flujo de inicio → prólogo → juego, con un menú de pausa. Es un cambio solo del cliente.

Ninguna de estas piezas cambia lo construido en la Fase 1.

## Arte

Catálogo de packs, licencias y la comparativa 0x72 / LPC en [`ART_OPTIONS.md`](ART_OPTIONS.md).

- **Fuentes:** `art-src/<pack>/`, con un `SOURCE.md` (origen, autor y licencia).
- **Especificación por juego y preset:** `content/<juego>/art/<preset>/`, con tres tipos de fichero:
  - `tiles.json`: terrenos. Las celdas se indican como `[col, fila]` o por nombre de una lista de sprites.
  - `characters.json`: personajes LPC por capas (cuerpo, cabeza, pelo, ropa, armadura, arma) con colores de paleta. Va fijado a un commit del generador LPC.
  - `sprites.json`: sprites animados que ya vienen en un atlas (0x72), indicando el prefijo de cada uno.
- **Construcción:** `npm run art` (Node y `pngjs`).
  - Descarga una sola vez las capas LPC necesarias en `art-src/lpc-generator/`.
  - Recolorea por paleta exacta, igual que el generador.
  - Compone las animaciones, incluidas las ampliadas de las armas (tajo de 128 px, estocada de 192 px), centradas sobre el cuerpo de 64 px.
  - Genera los créditos de cada capa (`CREDITS-characters.csv`) y escribe el manifiesto.
  - Lo generado se sube al repo.
- **Idle en LPC:** se usa la animación `idle` del generador si todas las capas la tienen; si no, el frame de pie de `walk` con respiración por código.
- **Licencias:** lo derivado de LPC (hojas compuestas y recoloreadas) se publica como CC-BY-SA 3.0. El código del proyecto es MIT y es una obra separada que solo carga el arte.

## Efectos y ambiente

Son sistemas reutilizables por los tres juegos, con la configuración en `content/<juego>/`.

**Aviso de arquitectura:** solo lo que influye en las reglas vive en `engine/` (la luz, y en la Fase 3 las superficies). Las partículas, el postprocesado y el juice son puro render y dependen de Phaser, así que van en **`src/fx/`**, la capa genérica del cliente, que es compartida por todos los juegos. Meterlos en `engine/` rompería su pureza (Node, servidor, multijugador).

| Sistema | Dónde | Configuración | Fase |
|---|---|---|---|
| Iluminación: oscuridad, antorchas, linterna, parpadeo | `engine/lighting.ts` (estado y nivel de luz) + `src/fx/LightingLayer.ts` | Capa `lights` y `ambientLight` en Tiled | **Hecho (base)** |
| Luz bloqueada por muros; el fuego de las superficies ilumina; brillo de conjuros | `engine/lighting.ts` + `src/fx/` | Datos de superficies y conjuros | 3 |
| Juice de combate: screen shake en impactos y críticos, hit-stop, números de daño flotantes, destellos, sangre como decal temporal, transición de cámara al cambiar de turno | `src/fx/juice.ts`, que escucha los eventos del motor | `content/<juego>/fx.json` (intensidades) | 2 |
| Animaciones por código: ataque con arma que pivota y avanza, golpe con parpadeo blanco y retroceso, muerte con caída, desvanecimiento y partículas, conjuros con brillo y partículas | `src/fx/procedural.ts` | Por sprite en el manifiesto (arma, anclaje) | 2 |
| Contorno de selección | `src/fx/` (shader o contorno de sprite) | — | 2 |
| Recoloreado por paleta para variantes de enemigos, facciones y equipo | `scripts/art/` (pipeline reproducible) | `content/<juego>/art/<preset>/palettes.json` | 2 |
| Superficies visuales animadas: aceite, fuego, agua, hielo, sangre | `src/fx/surfaces.ts` sobre `state.systems.surfaces` | Datos de superficies | 3 |
| Partículas de ambiente: niebla, polvo, ceniza, lluvia | `src/fx/ambient.ts` | Propiedades del mapa en Tiled | 6 |
| Corrección de color por escena (desaturado y frío), viñeta, CRT o scanlines desactivable | `src/fx/post.ts` (pipeline de postprocesado) | Por mapa y en opciones | 6 (hoy hay un filtro por preset) |
| Ajuste de calidad bajo, medio o alto (partículas, luces, postprocesado) | `src/fx/quality.ts` | Opciones del jugador (`localStorage`) | 6 |
| Audio: música por estado (exploración/combate/tensión/victoria/derrota/título) con crossfade, sfx agrupados, volumen maestro/música/sfx y mute (`localStorage`), desbloqueo en el primer gesto | `src/audio/AudioManager.ts` + `src/audio/setupAudio.ts` (un único suscriptor del `GameStore`, sin tocar `engine/` ni `rulesets/`) | `content/<juego>/assets/audio.json` (qué evento del motor dispara qué sonido o cambio de música; ver `docs/AUDIO.md` para el catálogo de fuentes) | **Hecho (módulo); ficheros de audio pendientes de aprobación** |

## Reglas 5e (`rulesets/dnd5e`)

- **Datos SRD 5.1** en `rulesets/dnd5e/data/*.json`:
  - armas, armaduras, monstruos (bandido, matón, capitán, guardia, esqueleto, zombi, orco) y razas (humano, elfo, enano, mediano, semiorco);
  - las 4 clases con su subclase del SRD (Campeón, Ladrón, Evocación, Vida) y rasgos y recursos **del nivel 1 al 6**;
  - conjuros de nivel 0 a 3, definidos como datos (ataque, salvación, daño, curación, área, condición, concentración). Los casos especiales se marcan con `special`.
- **Convenciones de la entidad:**
  - stats: características, `level`, `speed`, `ac` y `prof`/`multiattack` en monstruos;
  - tags: `class:`, `subclass:`, `race:`, `feature:`, `weapon:`, `spell:`, `prof:`, `expert:`, `resist:`, `immune:`, `vuln:`, `type:` y `pc`.
- **Reglas implementadas:**
  - Ataque con probabilidad exacta, críticos (19-20 para el Campeón) y ventaja desde arriba, contra indefensos o con tácticas de manada. Desventaja con un enemigo pegado al disparar.
  - Bendición, Ataque furtivo, Ataque extra y Ataques salvajes.
  - Resistencias, salvaciones, concentración y fortaleza de no muerto.
  - Caer y desangrarse (3 turnos), estabilizar, muerte, curación y Aguante incansable.
  - Reacciones automáticas: Escudo y Esquiva asombrosa.
  - Áreas (esfera, cono y línea) con Esculpir conjuros, Espíritus guardianes, Expulsar muertos vivientes y Preservar la vida.
- **Ajustes conscientes:** los conjuros multiobjetivo eligen automáticamente a los aliados más heridos. Las reacciones se usan solas cuando convienen (en el futuro, con una opción para preguntar). Las subidas de nivel interactivas (mejora de característica y elección de conjuros) llegan en la Fase 5; el nivel ya sale de la experiencia (ver «Progresión por experiencia»).

## Progresión por experiencia

- **Motor (genérico, `engine/progression.ts`).** El grupo comparte una bolsa de puntos en `state.systems.progress`. La llenan:
  - los combates ganados: al acabar, el motor suma `ruleset.progression.rewardFor` de cada enemigo del orden de turnos que haya caído (solo si gana el bando de un jugador);
  - el efecto `gainProgress { amount, id? }`, que usan los diálogos que resuelven un conflicto sin pelear. Con `id` solo paga una vez por partida.
- **Umbrales:** son contenido (`EngineContent.progression.thresholds`, nivel → puntos). Tras cada comando, fuera de combate y de diálogo, el motor reconstruye con `ruleset.progression.levelUp` a cada personaje de un jugador por debajo del nivel ganado y emite `leveledUp { level, from, entityIds }`. Un compañero que se une tarde se pone al día en el siguiente comando. El arnés de QA ve lo mismo que el jugador.
- **Ruleset:** `progression` declara la etiqueta («PX»), `levelOf` (null para lo que no sube de nivel), `levelUp` y `rewardFor`. En 5e son los PX del SRD de `monsters.json` y `levelUpCharacter`.
- **Cliente:** no decide nada. Cuando ve `leveledUp` del líder, espera a un momento tranquilo y narra cada nivel (`levels.texts`). El registro muestra los PX ganados y la ficha, «PX actual / siguiente nivel».
- **Intereses** (`content/intereses/levelups.json`): bolsa de grupo, nivel 4 a 1000 PX y nivel 5 a 1500 (unos 250 y 375 por personaje en un grupo de cuatro). No hay umbral de nivel 6. Las resoluciones habladas pagan lo mismo que el combate que evitan: mineros 175, juicio 500, Sinpaga 900, tregua de D1 800 y D2 100 (hito). `tests/playthrough/progression.test.ts` comprueba la curva en cada ruta.

## Cliente de combate

- **`GameController`** (`src/game/controller.ts`):
  - convierte el input en comandos;
  - hace que los compañeros sigan al líder en exploración;
  - lanza encuentros desde zonas de Tiled (capa `encounters`, propiedad `participants`);
  - ejecuta los turnos de la IA cuando la escena termina de animar.
- **`MapScene`:** reproduce los eventos en cola con juice (`src/fx/juice.ts`): estocada, destello, retroceso, números flotantes, temblor y pausa breve en los críticos, partículas de sangre, anillos de conjuro, caída y muerte, y paneo al personaje activo. Marca el personaje activo, el alcance de movimiento, los objetivos y el área.
- **`CombatHud`:**
  - barra de iniciativa, ficha del personaje activo, acciones y «Terminar turno»;
  - **panel de vista previa** con probabilidad, daño esperado y desglose con «?» que explica cada término en lenguaje llano. Hay que confirmar antes de actuar;
  - registro de tiradas.

## Entorno táctico (Fase 3)

**Motor (genérico):**
- **Línea de visión** (`engine/los.ts`): líneas de Bresenham sobre la cuadrícula. El terreno bloquea si es un muro a la altura de la vista o si sube 2 o más niveles por encima de los dos extremos. Las entidades con la etiqueta `obstacle` (cajas, barriles) obstruyen, pero no tapan la vista. Los muros también tapan la luz.
- **Empujar:** el efecto `push` y la función `simulatePush` (que usan también las vistas previas). Se para en muros, criaturas, el borde del mapa y desniveles que no se pueden subir. Emite `entityPushed` y `entityFell`.
- **Superficies** (`engine/surfaces.ts`): una capa por casilla en `state.systems.surfaces`.
  - Los tipos (`SurfaceDef`: duración, sobrecoste de movimiento, luz, peligro para la IA, en qué se convierte al caducar) y la tabla de reacciones a elementos los define el ruleset.
  - Efectos: `spawnSurface`, `applyElement` y `clearSurface`.
  - Envejecen cada ronda. Las que arden dan luz.
- **Consecuencias encadenadas:** tras cada acción, movimiento o empujón, el motor llama a `onFall` y a `onSurface` (al entrar y al empezar el turno), lo que permite cadenas como «empujado, cae y aterriza en el fuego».
- **Objetos** (`object` + `obstacle`): se pueden atacar, dan cobertura y nunca tienen turno. La IA no los elige como objetivo.
- **IA:** evita terminar en superficies peligrosas (`hazard`) y cuenta su coste de movimiento.

**Reglas 5e** (`rulesets/dnd5e/environment.ts` y `cover.ts`):
- **Superficies:** aceite, grasa, fuego (3 rondas, quema 1d6), agua, hielo, agua electrificada (1d6 y sin reacciones; vuelve a ser agua), sangre y escombros (terreno difícil).
- **Reacciones:** el fuego prende el aceite y la grasa, derrite el hielo y evapora el agua. El frío congela el agua. El rayo electrifica el agua.
- **Caídas:** 1d6 por cada nivel por encima del primero, y quien cae queda derribado.
- **Cobertura:** solo dan cobertura los objetos, no las criaturas. Con uno, +2 a la CA; con dos, +5. Sin línea de visión no se puede disparar ni lanzar conjuros a distancia.
- **Elementos de los conjuros:** el fuego prende la casilla del objetivo o el área.
- **Nuevos conjuros:** Onda atronadora (empuja 2 casillas) y Grasa (crea la superficie).
- **Acción Empujar:** Atletismo enfrentado contra Atletismo o Acrobacias, o contra CD 10 si es un objeto.
- **Barriles de aceite:** explotan al romperse (3d6 de fuego alrededor, salvación de DES para la mitad) y dejan aceite en llamas.
- **Vistas previas:** muestran la cobertura, a quién empuja y si caerá (con el daño esperado) o acabará sobre una superficie.

**Cliente:**
- Superficies animadas del pack (o manchas de color si falta el arte).
- Barriles y cajas, con su versión rota al destruirlos.
- Animaciones de empujón, caída, resbalón, explosión y vapor.
- Nombre de la superficie al pasar el ratón por la casilla.
- Tocar el sprite de una criatura la selecciona aunque sobresalga hacia otra casilla.

## Mapas (Tiled)

- **Formato:** mapa **ortogonal** con los tilesets incrustados.
- **Tileset lógico:** el tileset es **lógico** (`terrain-logic.png`, generado con `npm run gen:logic-tiles`). Solo sirve para pintar terrenos en el editor. El arte real lo pone el preset según el `terrain`, así que el mismo mapa se ve con cualquier pack.
- **Capa `ground`:** cada tile del tileset tiene las propiedades `terrain` (string), `height` (int) y `walkable` (bool).
- **Capa de objetos `spawns`:** puntos con nombre.
- **Capa de objetos `lights`:** puntos con `radius`, `intensity`, `color` y `flicker`.
- **Propiedad del mapa `ambientLight`:** valor entre 0 y 1.
- **Capas de objetos rectangulares** (por ejemplo `encounters`): zonas con propiedades, guardadas en `state.systems.zones`. La capa `surfaces` (propiedad `surface`) pinta las superficies iniciales.
- **Objetos del escenario:** puntos de `spawns` llamados `barrel_oil-N`, `barrel-N` o `crate-N`.
- **Pendiente:** capas de superficies, interactuables y ambiente (niebla, ceniza…).

## Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Movimiento en 8 direcciones con coste 1 en diagonal (5e) y sin atajar esquinas | Simple y legible |
| Subir un nivel cuesta 1 movimiento extra; un desnivel de 2 o más corta el paso a pie | Saltar o trepar será una acción aparte. Configurable en `ruleset.movement`. |
| RNG sfc32 con su estado completo dentro del `GameState` | Partidas reproducibles y tiradas auditables |
| Un solo paquete npm, sin workspaces | Menos complejidad. Las fronteras se hacen cumplir con `tsconfig` y tests. |
| Phaser 3.90 | Pedido en el encargo. Phaser 4 existe, pero no aporta nada necesario ahora. |
| Varios juegos en un repo, desplegados en `/willysGate/<juego>/` con una portada en `/willysGate/` | Cada juego tiene su URL sin duplicar el motor |
| **Vista cenital 3/4 en lugar de isométrica** (2026-10-17) | Hay muchos más assets coherentes para táctico. El motor no cambia: solo el render y el cargador de Tiled. |
| Sin giro de mapa | En 3/4 el arte está dibujado mirando a cámara |
| Sprites de 2 direcciones con volteo; 4 direcciones opcionales | En un táctico por turnos basta con izquierda y derecha, y amplía los packs utilizables |
| La altura es visual: cada casilla sigue siendo una posición lógica | Caídas y empujones simples. La alternativa de acantilados en casillas propias, al estilo RPG Maker, complica las reglas. |
| Código MIT; arte derivado de LPC CC-BY-SA 3.0 | Obligación de la licencia BY-SA, sin afectar al código |
