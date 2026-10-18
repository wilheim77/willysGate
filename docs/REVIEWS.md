# Revisiones de QA y por qué se escaparon tres cuelgues

Registro del agente revisor. Los informes completos de cada pasada viven fuera del repo (scratchpad del revisor); aquí quedan las conclusiones que cambian cómo trabajamos.

## 1. Los tres cuelgues de la prueba de juego (2026-10-18)

| Síntoma | Causa | Arreglo (en `main`) |
|---|---|---|
| Un combate se quedó en el turno de un enemigo | El cliente dejaba caer el turno de la IA si la escena estaba `busy` cuando saltaba el temporizador; y un tween de paseo que moría con su sprite dejaba `busy` en verdadero para siempre | `scheduleAi` reintenta mientras `busy`; `animateMove` se asienta una sola vez (fin, sustitución o perro guardián); `playQueue` con perro guardián por evento |
| Un combate se quedó al saltar una trampa | Quien caía a 0 PG **durante su propio turno** (trampa bajo los pies, ataque de oportunidad, su propia bola de fuego) no podía terminar el turno y nadie lo hacía por él | `passTurnIfHelpless` en `engine/commands.ts`: tras cualquier orden en combate, si el activo no puede actuar, el turno pasa solo |
| El juego se quedó parado con el Cobrador incapacitado | No existía flujo de derrota: un líder caído fuera de combate es un estado sin ninguna acción posible | `src/main.ts`: al acabar la pelea con el líder caído, se ofrece repetirla desde el momento anterior |

### Por qué no lo vimos antes

1. **El harness y el revisor usaban la misma muleta que el cliente.** El conductor de QA (y mis sondeos de equilibrio) hacían `if (!result.ok) endTurn SYSTEM`. Cuando un luchador caía en su propio turno, el harness pasaba el turno en silencio y el combate «terminaba bien». Medíamos victorias y caídas, no «¿quién avanzó el estado y por qué?». El mismo cuelgue estaba delante en cada simulación de la revisión 4 y la 9, enmascarado.
2. **Nadie ejecutó el cliente.** Nueve pasadas de revisión y toda la QA fueron sin DOM: grafo de diálogos, marcas, mapas, motor. Un tween que muere, un temporizador que se pierde o un `busy` que no baja son invisibles sin Phaser. Lo asumimos «asunto del jugador manual».
3. **Auditamos puertas, no estados terminales.** La revisión 9 buscó callejones de interfaz en las *salidas* (el camino cerrado sin mensaje), pero no preguntó qué ve el jugador cuando el líder está caído, cuando nadie puede actuar o cuando un diálogo no ofrece opciones. La derrota no estaba en ninguna lista porque nunca «fallaba»: simplemente no pasaba nada.
4. **Clasificamos síntomas por su causa, no por su efecto.** La revisión 4 encontró que la IA nunca cura a un caído y lo archivó como equilibrio. Cualquier «el estado no avanza» es un bloqueo, venga de reglas, IA, cliente o contenido.

### Cambios de proceso (revisor y QA)

- **Cero rescates.** En todo soak, un `endTurn` emitido por SYSTEM desde fuera del motor es un **fallo del test**, salvo que el propio motor lo haya emitido (`passTurnIfHelpless`). El conductor cuenta los rescates y afirma cero.
- **Invariante de avance tras cada orden.** Test del motor: tras cualquier orden `ok` en combate, `ruleset.canAct(activo)` es verdadero o el turno ya ha pasado dentro de la misma orden. Tras cualquier orden fuera de combate, el líder puede moverse, hablar o viajar, o hay un diálogo abierto con al menos una opción disponible.
- **El cliente se prueba.** Antes de cada demo, una partida en el navegador (panel del cliente) que cubra: el combate del camino, una trampa que salta, un líder que cae, cargar una partida guardada en pleno combate. Con un perro guardián en el cliente: `busy` no puede seguir en verdadero más de 10 s sin eventos nuevos (`console.warn` + aviso en el HUD), y el revisor lo lee.
- **Lista de estados terminales en cada revisión.** Líder caído (en y fuera de combate), grupo entero caído, activo que no puede actuar, diálogo sin opciones disponibles, salida cerrada, pregunta de trampa abierta al empezar un combate, partida cargada en turno de la IA. Para cada uno: ¿qué ve el jugador y qué botón tiene?
- **Un «no avanza» siempre es bloqueo**, se informa el primero y se encamina al dueño del estado (motor, cliente, contenido), no al del síntoma.

## 2. Otros agujeros de «nadie avanza el estado» (auditoría del 2026-10-18, `main d95b38a`)

1. **Cargar una partida en turno de la IA cuelga el combate** (`src/scenes/MapScene.ts:189-196`). En `reset` la escena vacía la cola y reconstruye el mundo, pero `hooks.onIdle()` solo se llama al final de `playQueue`. `controller.onIdle` es lo único que programa la IA (y revisa encuentros, escenas, disparadores y salidas). Título → «Continuar», HUD → «Cargar» y el propio reintento de derrota pasan por `store.load`: si el estado guardado está en combate con un enemigo activo, nadie mueve. Arreglo: tras `buildWorld(state)` en el `reset`, llamar a `this.hooks.onIdle?.()` (o que el controlador trate `reset` como `onIdle`).
2. **IA que repite una orden válida sin efecto.** `scheduleAi` → orden `ok` → eventos → `onIdle` → misma orden. Hoy no hay ninguna que no gaste algo, pero no está garantizado por contrato (una acción de coste cero y válida, o un `move` que el motor acepte sin desplazar). Guardia barata: contador de órdenes de IA por turno en el controlador (p. ej. 40) → `endTurn` SYSTEM con `console.warn`; y la misma aserción en el conductor de QA.
3. **`passTurnIfHelpless` depende de `canAct`, no de «puede hacer algo».** Un activo que puede actuar pero sin acciones asequibles ni movimiento (todo gastado, Apresado) no cuelga porque el jugador tiene «Terminar turno» y la IA devuelve `endTurn`; vale la pena una aserción en QA de que `nextAiCommand` nunca devuelve dos veces la misma orden en el mismo turno.
4. **La pregunta de trampa (`dialogue.ask`) no bloquea el mapa.** El jugador puede alejarse con la pregunta abierta; si entonces empieza un combate, el panel sigue mostrando la pregunta encima del HUD de combate hasta «Dejarlo». No es cuelgue, pero sí confusión; cerrar la pregunta al primer evento de movimiento o combate.
5. **`reset` con un paseo en vuelo.** `buildWorld` destruye sprites mientras `animating > 0`; el perro guardián de `animateMove` (`delayedCall`) termina de asentar y `sprite.active` evita tocar el sprite muerto ✓. Correcto, pero depende del reloj de Phaser: si la escena está en pausa (pestaña oculta) el `delayedCall` también, lo cual es coherente.

Lo demás revisado (`beginTurn` con todos incapaces, despawn del activo, trampa que apresa a la IA, caída del líder fuera de combate por fuego o trampa, diálogo sin opciones) avanza o está cubierto por los arreglos actuales y por los tests de contenido.

## 3. Coherencia de trama: bloqueos por tiradas fallidas

Estado al 2026-10-18 (`main`): las 17 marcas críticas tienen al menos un setter sin tirada (test `dialogueWalker`); el conductor de QA (`tests/playthrough/driver.ts`) llega a `epilogo_visto` por la matriz D1×D2×D3×D4; mi recorrido guionizado independiente (camino → … → epílogo, 17/17 marcas) coincide, con la salvedad de que **las subidas de nivel son del cliente** (`controller.checkLevels`): cualquier flujo sin DOM (harness, servidor, mis sondeos) pelea contra Brea a nivel 3 (71 % de victorias) en vez de a nivel 6. Conviene que las reglas de `levelups.json` se apliquen en el motor (como los disparadores), para que guardados, QA y cliente coincidan.

Reglas que se mantienen desde la revisión 2: ninguna información del camino crítico detrás de una sola tirada; una tirada fallida cuesta dinero, tiempo o reputación, nunca la puerta; todo disparador y toda escena `once` tienen cierre y alternativa.

## 4. Índice de pasadas

| # | Fecha | Ámbito | Hallazgos de mayor peso |
|---|---|---|---|
| 1 | 2026-10-17 | Fase 3 (entorno) | Superficies que no envejecen si el último del orden está muerto; Onda atronadora hiere al lanzador; objetos como «enemigo pegado» |
| 2 | 2026-10-17 | Fase 4 (diálogos) + trama | Partida guardada en diálogo sin árbol → bloqueo; hablar con cadáveres; neutrales hostiles para todos; puertas del acto sin alternativa |
| 3 | 2026-10-17 | Trampas, creación, caducidad | Caducidad en exploración borra Armadura de mago; desactivar gratis e ilimitado; `buildProtagonist` con claves de más |
| 4 | 2026-10-17 | Equilibrio por simulación + ruleset Willy | Encuentro de prueba trivial → V10; condiciones que anulan `canAct` no caducan (motor); enredado permanente |
| 5 | 2026-10-17 | Contenido del acto (guion/mapas) | Zonas rodeables; ids guion≠mapa; escena de apertura sin disparador; Garrán opcional |
| 6 | 2026-10-17 | Mundo, invocaciones, ganchos, Willy jugable | Efectos de diálogo sin encadenar; `travel` sin puertas; puertas sin guion mudas; Escorial como encuentro |
| 7 | 2026-10-17 | Acto completo, disparadores, `jump.ts` | Bóveda sin diálogo → fin de partida; «pensarlo» consumía disparadores; D1 sin combates; `essential` sin aplicar |
| 8 | 2026-10-17 | D1 real, golden path, matriz | Combates de D1 como empate infinito (`noncombatant`); sin alianzas; disparadores sin cierre |
| 9 | 2026-10-18 | Preparación de la demo | Salidas cerradas mudas; esenciales caídos para siempre; jefe a nivel 3 (71 %); recorte P+1+2+3 |
| 10 | 2026-10-18 | Dificultad de Willy, cuelgues, secuencia | Este documento; línea base de Willy en solitario (ver informe) |
