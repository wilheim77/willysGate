# Progreso

## Estado actual

- **Fase 0, Historia:** completada y aprobada (2026-10-16).
- **Fase 1, Esqueleto técnico:** **completada y aprobada** (2026-10-17). Arte: 0x72 como base y Ninja Adventure para exteriores. LPC se queda como preset alternativo.
- **Fase 2, Combate:** **completada** y probada por el usuario en el móvil (2026-10-17). Progresión del acto: de nivel 3 a 6.
- **Fase 3, Entorno táctico:** **aprobada** (2026-10-17).
- **Fase 4, Exploración, diálogos y grupo:** **en curso**. Decisiones (2026-10-17): creación por compra de puntos (con botón «recomendado»); la aprobación de los compañeros se muestra con reacciones («Garrán aprueba») y los números en la ficha. Retrato del Cobrador: variante A (bufanda).
- **Willy el mazmorrero:** un subagente trabaja en paralelo en la rama `willy` (diseño de la Fase 0, logros, cajas de botín y generación procedural). Solo toca `docs/willy/` y `content/willy/`.

## Hecho

### Fase 0
- [x] Historia «Intereses» aprobada ([`STORY.md`](STORY.md)), con el Elfo como raza y la enemistad entre elfos y enanos.
- [x] Encargo original y cambios aprobados en [`BRIEF.md`](BRIEF.md).

### Fase 1
- [x] Vite 8, TypeScript 5, Phaser 3.90, Vitest 5 y despliegue de varios juegos en GitHub Pages.
- [x] Capas `engine/` (genérico), `rulesets/` (`common`, `dnd5e`) y `content/<juego>/`, con un test de arquitectura y un ruleset de juguete sin D&D. Ver [`DESIGN.md`](DESIGN.md) y [`NEW_GAME.md`](NEW_GAME.md).
- [x] Motor:
  - `GameState` serializable con stats, recursos y condiciones genéricos;
  - RNG sfc32 con su estado dentro del `GameState`;
  - A* con altura;
  - comandos y efectos;
  - pruebas (checks) con desglose genérico;
  - guardado con migraciones;
  - cargador de Tiled ortogonal e isométrico;
  - **sistema de iluminación** (fuentes fijas o llevadas por una entidad, luz ambiente y `lightLevelAt`).
- [x] **Cambio a vista cenital 3/4** (2026-10-17):
  - render ortogonal con capas de elevación (caras de acantilado o muro, bordes y sombras);
  - sin giro de mapa;
  - sprites de 2 direcciones con volteo, o de 4 (LPC);
  - sombra de contacto y respiración en reposo por código.
- [x] Iluminación en el cliente: oscuridad, linterna del protagonista y antorchas con parpadeo. Filtro de color por preset.
- [x] **Pipelines de arte reproducibles** (`npm run art`):
  - tiles por preset;
  - personajes LPC por capas, con créditos generados automáticamente;
  - sprites de atlas (0x72).
- [x] Escenas de prueba con el mismo mapa: `?arte=0x72` (por defecto) y `?arte=lpc`. Comparativa en [`ART_OPTIONS.md`](ART_OPTIONS.md).
- [x] Licencias: código MIT (`LICENSE`); arte derivado de LPC, CC-BY-SA 3.0 (`CREDITS.md`).
- [x] Tests: 107.

- [x] Arte elegido: 0x72 (base) y Ninja Adventure (exteriores, ya integrado en tierra y acantilados).
- [x] Confirmado en un móvil real que pellizcar no mueve al personaje.

### Fase 2 (en curso)
- [x] Motor: combate por turnos, acciones genéricas, interrupciones (ataque de oportunidad), IA genérica y efectos de teletransporte y de máximo de recurso. Esquema v2 con migración.
- [x] dnd5e: reglas de combate del SRD y las 4 clases con datos del nivel 1 al 6, conjuros de nivel 0 a 3, razas y monstruos.
- [x] Cliente: encuentro de prueba (grupo a nivel 3 contra los Sinpaga), HUD de combate, vista previa con glosario, registro de tiradas y juice básico. Probado en el navegador: el combate salta, el ataque con vista previa, Manos ardientes con salvaciones y los turnos de la IA funcionan.
- [x] Tests: 153.
- [x] Integrada la rama `art`: compañeros y Sinpaga recoloreados, tablones, andamio, techos de muro, antorchas y braseros animados, sangre, chispas, rebordes y las intros en viñetas de ambos juegos (guion de Intereses como borrador en `docs/intros/INTERESES.md`, pendiente de aprobación). En el render ya funcionan las antorchas, la sangre, las chispas y los rebordes.
- [x] Escala por sprite (Garrán a 1,15). Los seguidores ya buscan otra casilla si la suya no es alcanzable.
- [ ] Pendiente del arte: polvo al moverse, tile lógico de `scaffold` y reproductor de cinemáticas (Fase 6).
- [x] Integrada la rama `willy` (Fase W0 de *Willy el mazmorrero*: diseño, ruleset, narrador, logros, botín, procedural y peticiones al motor). Pendiente de aprobación del usuario: ver `docs/willy/PROGRESS.md`.
- [x] Integradas las clases nuevas de Willy: Funcionario, Jugador de basket e Ingeniero (con el 5G secreto que sube hasta 10G). Nueva petición al motor R15 (salto y rebote de proyectiles).
- [ ] Probar el combate completo en el móvil y ajustar el HUD.
- [ ] Equilibrar el encuentro de prueba y pulir (los compañeros a veces no siguen al líder en desniveles).

### Fase 3
- [x] Motor: línea de visión (también para la luz), empujones con caídas, superficies como datos, consecuencias encadenadas, objetos y una IA que evita el peligro.
- [x] 5e: superficies y reacciones, caídas, cobertura, elementos de los conjuros, Onda atronadora, Grasa, Empujar y barriles explosivos.
- [x] Arte (agente de arte): superficies animadas, barriles, cajas rotas, explosión y vapor.
- [x] Mapa de prueba con meseta alta, aceite, agua, escombros, cajas y barriles.
- [x] Corregido: tocar el sprite de un enemigo lo selecciona (antes podía caer en la casilla de arriba).
- [x] El fuego recorre todo el charco de aceite o grasa conectado, y el rayo toda el agua conectada. Probado en el navegador: explosión del barril, aceite ardiendo y luz del fuego.
- [x] Los ataques contra objetos (barriles, cajas) impactan siempre, sin crítico; la vista previa y el registro lo indican.
- [x] Fichas de personaje: retratos del grupo siempre en pantalla; tocar un retrato o una ficha de iniciativa abre la ficha (combate, características, habilidades, recursos, armas, conjuros, rasgos, defensas, estados), con «?» del glosario. El ruleset la rellena con `describeEntity` (genérico en el motor).
- [x] Registro de combate plegable (una línea / panel con desplazamiento); se recuerda la elección.
- [x] Revisión del subagente revisor (Fable) aplicada:
  - el fuego se apaga aunque el último de la iniciativa esté muerto;
  - Onda atronadora ya no daña al lanzador;
  - cajas y barriles no cuentan como enemigos pegados ni para el ataque furtivo;
  - un objeto destruido no da cobertura;
  - los conjuros con varios objetivos exigen ver a todos;
  - un compañero caído ocupa su casilla (`Ruleset.occupiesTile`);
  - los caídos sufren fuego y explosiones (se desangran antes);
  - levantarse del suelo cuesta la mitad del movimiento y resbalar detiene el paso;
  - el camino evita el fuego si le llega el movimiento (`movePath`, también en la vista previa) y marca en naranja las casillas peligrosas;
  - el alcance pintado cuenta el coste de los escombros;
  - las superficies pintadas en el mapa duran y dan luz como las demás;
  - los barriles dentro del fuego arden y acaban explotando.
- [x] Tests: 205.
- [x] Prueba del usuario en el móvil: **Fase 3 aprobada** (2026-10-17). Cambio pedido: el barril de aceite explota con el primer punto de daño.

### Fase 4 (en curso)
- [x] Motor de diálogos (`engine/dialogue.ts`): árboles como datos, condiciones (marcas, objetos, reglas del ruleset, all/any/not), tiradas visibles a través del ruleset, opciones de una sola vez, efectos (marcas, objetos, reclutar con `setController`, abrir puertas con `setTile`, empezar combate). `interact` para hablar con o usar algo adyacente (`dialogue:<id>`).
- [x] Inventario genérico (`engine/inventory.ts`, por dueño o `party`).
- [x] 5e: `describeCheck` (nombre y probabilidad de una prueba antes de tirar).
- [x] Cliente: ventana de diálogo con retrato, opciones «[Persuasión] CD 13 · 40 %», opciones bloqueadas con pista («[Elfo]») y el d20 en pantalla tras cada tirada. Tocar a alguien con quien se puede hablar te acerca y abre la conversación.
- [x] Prueba de contenido: enlaces válidos, reglas y pruebas existentes, **sin bloqueos** (cada nodo con opciones tiene una sin condición ni tirada, y todo nodo puede llegar al final).
- [x] PNJ de prueba: el viejo minero en el mapa de prueba.
- [x] Creación de personaje con compra de puntos: pasos como datos (`engine/creation.ts`), 5e los rellena (nombre, raza, clase, 27 puntos de 8 a 15, «Recomendado» por clase, bonos de raza visibles), pantalla al empezar y tras «Nueva», con «Partida rápida».
- [x] Trampas (`engine/traps.ts`): ocultas hasta que alguien las nota (5e: Percepción pasiva al pasar a 2 casillas), saltan al pisarlas (5e: salvación, daño, estado), los caminos evitan las conocidas; desactivar con prueba (fallar por 5 o más la dispara). En el cliente: marca roja, tocarla acerca al grupo y pregunta quién lo intenta con su probabilidad; el d20 se ve. Trampa de prueba «cepo» en el mapa de prueba.
- [x] Fuera de combate, los estados con duración se pasan al volver a moverse.
- [x] Revisión 2 aplicada: no se habla con muertos; `startDialogue` solo para guiones; cualquier combate cierra la conversación; `endDialogue` y cierre automático si una partida guardada apunta a un diálogo que ya no existe; opciones «una vez» con `id` estable; etiqueta `noncombatant` (nadie es hostil a un transeúnte); `setController`/`setTile` validan; tests de contenido más estrictos.
- [x] Reglas de trama adoptadas: ninguna información crítica tras una sola tirada; fallar cuesta dinero, tiempo o reputación, nunca la puerta. El viejo minero ya da la pista también si le pagas.
- [x] Interactuables como diálogos sobre objetos: cofre con aguja envenenada (verla con Investigación, abrir con Juego de manos o con la llave del viejo, sin tirada), puerta atrancada (Atletismo) y palanca que la abre sin tirada. Nuevo efecto `setEntity` (cambiar sprite, nombre y etiquetas). Los objetos solo ocupan casilla si son obstáculo.
- [x] Revisión 3 aplicada: fuera de combate solo caducan los estados a punto de acabar (la Armadura de mago ya no se pierde al andar); un intento de desactivar por trampa y personaje; los enemigos no revelan trampas al jugador; empujar o teletransportar sobre una trampa la dispara; pisar trampa y superficie aplica las dos; `buildProtagonist` normaliza las características; `endDialogue` funciona aunque el hablante ya no exista.
- [x] Objetos con nombre y descripción (`items.json`) y «Mochila del grupo» en la ficha.
- [ ] `flags.json` con marcas críticas + tests (marca crítica alcanzable sin tiradas, marcas leídas y nunca escritas, PNJ esenciales).
- [x] El acto carga sus mapas reales (`content/intereses/world.ts`): camino, plaza, abadía, calles, Escorial, mina y Bóveda; reparto (`cast.json`), plantillas (`templates.json`), objetos, puertas/cofres/palancas con su diálogo, trampas, superficies y luces. La partida empieza en «El camino» con la conversación de Dorotea; `?mapa=<id>` empieza en otro mapa y `?mapa=test` abre la arena de pruebas.
- [x] Guion (agente guionista): prólogo, escena 1 (llegada y juicio de Anselmo), escena 2 (audiencia) y escena 3 (hilos sueltos), con `flags.json` y pistas críticas con varias fuentes sin tirada.
- [x] **Guion** (rama `guion`): el acto entero escrito como datos en `content/intereses/dialogues/` (unos 30 árboles), con `flags.json` (marcas críticas alcanzables sin tirada), `cast.json` y objetos nuevos.
  - Escenas: prólogo, 1 (llegada y juicio), 2 (audiencia), 3 (hilos sueltos), 4 (Escorial y Pozo), D1 (noche de las antorchas, con sus dos desenlaces y las puertas de la bocamina y la cripta), 5 (Galería Sellada y D2), 6 (Brea, la losa y D3), 7 (el cobro, D4) y el epílogo en viñetas.
  - Revisión 5 (A) aplicada.
  - Pendiente: los ganchos de escena y la mecánica que lista `docs/ENGINE_REQUESTS_INTERESES.md` (sección «Pendiente para los mapas y los guiones de escena»).
- [x] Peticiones del guion: `next` condicional (G1), consecuencias al ganar o perder un combate abierto desde un diálogo (G2), condición `inParty` (G3). Escenas que abren diálogo al entrar (I1), zonas condicionadas por marcas (I4), derrumbes con `setTiles` (I5).
- [x] Motor: invocaciones y barreras (R13), `onTurnEnd`/`onCombatStart`, vapor que tapa la vista y `onRoundEnd` (R20), vacío y choques (R17, R18), cambio de mapa (R10), `deriveSeed` (R12), marcadores (R14), `modifyStat` (R19).
- [x] Arreglos de la revisión 4: los turnos saltados también cuentan para los estados (aturdido, paralizado); la IA cura a sus caídos; empujar y Onda atronadora valoran caídas y superficies; combate de prueba reequilibrado (V10).
- [x] *Willy el mazmorrero* jugable por primera vez: reglas completas de las 9 clases, casting, Camerino y un piso 1 de prueba (`/willysGate/willy/`).
- [ ] Terreno exterior para el acto (encargado al artista).
- [x] R10 cambio de mapa (`engine/world.ts`): varios mapas en una partida; el que se deja queda guardado tal cual (cadáveres, puertas abiertas), el nuevo se construye la primera vez con `EngineContent.maps`. Comando `travel` desde zonas `exits` (propiedades `to`, `spawn`) y efecto de diálogo `travel`. El grupo viaja junto y se lleva la linterna.
- [x] Mapas del acto (agente de mapas, rama `mapas`): `camino`, `plaza`, `abadia`, `calles`, `escorial`, `mina` y `boveda`, generados desde `scripts/maps/src/`, con un test de validación (`tests/content/maps.test.ts`) y su documentación en [`MAPS.md`](MAPS.md). Las peticiones pendientes (resonadores, polea, marcas que faltan) están en `ENGINE_REQUESTS_INTERESES.md`.
- [x] R12 `deriveSeed`, R14 capa `markers` (y puntos de Tiled como zonas 1×1, propiedades del mapa), R19 efecto `modifyStat`.
- [ ] Peticiones de Willy al motor: causa en eventos (R11), invocaciones (R13), salto (R15), generador (R16), choques (R17), vacío (R18), `modifyStat` (R19), `blocksSight`/`onRoundEnd` (R20).

- [x] Pruebas de juego del 2026-10-18:
  - Cuelgues arreglados:
    - El turno pasa solo si quien juega cae en su propio turno (trampa, ataque de oportunidad).
    - Las animaciones ya no pueden dejar la partida «ocupada» para siempre.
    - La IA reintenta su turno si está ocupada.
  - Derrota: si el líder no puede levantarse al acabar el combate, se ofrece «Volver a intentarlo» desde antes del combate.
  - Cámara: al cambiar de mapa sigue al personaje.
  - Movimiento: se camina más rápido fuera de combate y los compañeros no bloquean.
  - Enemigos: al empezar el combate parpadean en rojo con un «!» y la cámara los enfoca. Quien no participa lleva anillo neutro.
  - Mapas:
    - Las casillas no transitables se ven más oscuras.
    - Tejados de teja con alero y remates de muro nuevos.
    - Los escalones se dibujan como escalera (`stair`).
  - Efectos: los efectos visuales salen de `manifest.fx`, en los dos juegos.
  - QA: el driver ya no tapa los turnos atascados del jugador.
- [x] **Bestiario** (rama `bestiario`, 2026-10-18):
  - Los monstruos pueden lanzar conjuros del SRD (espacios o «x/día»), usar poderes propios con recarga 5-6 o «1/día» (`monster-actions.json`) y llevar efectos al impactar: parálisis del necrófago, derribo del lobo, drenar vida del tumulario (baja los PG máximos hasta el final del combate), veneno de la araña. Rasgos: parada, bruto, hedor, devoción oscura, valiente, inmunidades a estados.
  - Nuevos: sectario, fanático sectario, acólito, sacerdote, mago, aprendiz de mago, espectro, araña gigante y el capataz de voladuras (Absalón Brea: bomba de pólvora con recarga 5-6 y grito 1/día). Mejorados los del agente de mapas (veterano, caballero, gladiador, ogro, necrófago, ghast, tumulario, mastín, lobo).
  - IA (genérica): valora estados y mejoras (`utility` en la vista previa), no gasta espacios ni recargas si no compensa (`scarcity`) y los lanzadores guardan la distancia (`keepAway`, por criatura vía `Ruleset.aiProfile`).
  - Intereses: un predicador entre los fanáticos de la plaza, un curandero con los Sinpaga y un capellán con la guardia del barón.

## Prioridades de los agentes (2026-10-18)

Hay dos líneas en paralelo. Cada agente sigue su lista en orden y sube su rama al terminar cada punto.

**Intereses (demo jugable y táctica)**
- **Mapas:**
  1. Combate tutorial.
  2. Rediseño táctico de las zonas de combate: coberturas, alturas, cuellos de botella, peligros.
  3. Mapas intermedios con encuentros, como el callejón.
  4. Documento `ENCOUNTERS.md` con los PX de cada encuentro.
- **Progresión:** subida por PX en el motor, del nivel 3 al 5 antes del combate final, y los PX visibles en la ficha.
- **Bestiario:** conjuros y habilidades especiales de monstruos (SRD), y enemigos lanzadores, no muertos con toque especial, sanadores y un jefe con recarga.

**Willy (partida larga y meta)**
- **Willy:**
  1. Reloj de derrumbe.
  2. Partida más larga: más plantas y más grandes, curva de niveles y habilidades que suben por uso hasta el máximo en el jefe final.
  3. Variedad de enemigos con habilidades.
  4. IA que empuja y usa barriles.
- **Meta:**
  1. Logros.
  2. Cajas de botín, objetos, pociones e inventario.
  3. Curación fuera de combate.
  4. Elegir el modo, con o sin repetición.
- **Show:** audiencia y seguidores, patrocinadores y el medidor Share del jefe.

**Transversales**
- **Arte:** primero los enemigos nuevos y los efectos de derrumbe de Willy, luego la caja de botín, los iconos de objetos y los logros.
- **Cliente:** la pregunta de trampa como ventana modal y una prueba automática en el navegador real.
- **QA:** el arnés de partida completa de Willy, que activa cada comprobación cuando llega su rama.
- **Revisor:** primero la revisión 11, una partida real de Intereses en el navegador, luego revisar cada rama al integrarla.

## Planificado para más adelante

- **Efectos y ambiente** (2026-10-17): ver `DESIGN.md` → «Efectos y ambiente».
  - Fase 2: juice de combate, animaciones por código, contorno de selección y recoloreado por paleta.
  - Fase 3: la luz se bloquea con muros, el fuego ilumina y las superficies son visuales.
  - Fase 6: partículas de ambiente, postprocesado por escena, viñeta, CRT y ajuste de calidad.
- **Introducción y onboarding** (Fase 6): ver `DESIGN.md` → «Introducción y onboarding». El guion del prólogo está pendiente como anexo en `STORY.md`.

## Decisiones de la Fase 2 (aprobadas el 2026-10-17)

- **A 0 PG:** los personajes del grupo quedan inconscientes y se desangran en 3 turnos si nadie los cura o estabiliza, con el contador visible. Los enemigos mueren directamente.
- **Turnos:** iniciativa individual de 5e.
- **«Caída»** en la Fase 2 es caer a 0 PG. El daño por caer desde una altura llega con los empujones (Fase 3).
- **Grupo:** el jugador controla a todos los compañeros en combate.
- **Niveles:** se empieza a nivel 3 y se termina a nivel 5-6. Las clases tienen datos del 1 al 6, solo con contenido del SRD 5.1. La subida de nivel interactiva llega en la Fase 5.

## Decisiones abiertas

- (2026-10-18, aprobado) Progresión y combates:
  - **Combate tutorial:** una pelea fácil al empezar el camino.
  - **Niveles por PX:** se empieza en nivel 3 y hay que llegar a nivel 5 antes del combate final. Las subidas se aplican en el motor.
  - **Diálogos:** se mantienen.
  - **Más encuentros:** mapas más grandes y mapas intermedios pequeños, como un callejón.
  - **Guardias:** no intervienen.

- ¿Un cuarto compañero **mago** opcional? Por ahora no.

## Siguiente paso

Implementar la Fase 2: turnos y combate en el motor, reglas de ataque y clases en dnd5e, IA, interfaz de combate y encuentro de prueba.
