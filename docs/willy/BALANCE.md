# Willy el mazmorrero: equilibrio

> Cómo se mide y se ajusta la dificultad. Simulador: `content/willy/sim/balance.ts` (`simulateFloor` y `simulateSeason`). Tests: `tests/content/willy-balance-*.test.ts` (el piso 1 en `npm test`, los diez con `QA_DEEP=1`). Sonda manual de temporadas: `SIM_SEASON=3 npx vitest run tests/content/willy-season-probe.test.ts --silent=false`.

## Qué se mide

**Una temporada entera** (`simulateSeason`), jugada por la IA de los dos lados:
- Willy empieza a nivel 1 y gana experiencia de verdad; su compañero viene con él.
- Recorre los diez pisos en orden, con los usos de habilidad acumulándose.
- Al pasar por el Camerino recupera toda la vida.
- Dentro de un piso la vida pasa de un combate al siguiente. Solo vuelve lo que dan las reglas: la Pausa publicitaria (25 % al acabar cada combate), la regeneración al andar (`willy.json → regeneracion`) y la energía.
- El simulador carga el espectáculo (audiencia, patrocinadores y el Share del Presentador).
- Si se pierde un combate, se repite con otros dados, como «Volver a intentarlo». La temporada tiene 15 repeticiones en total; si se acaban, la temporada se pierde.

Por piso se mide:
- **Piso limpio:** se pasa sin repetir ningún combate.
- **Jefe a la primera:** el jefe (o el guardián, en el primer piso de cada planta) cae sin repetir.
- **Nivel al salir:** el nivel de Willy al bajar la escalera.

La IA juega peor que una persona: no se retira, no prepara combos, no abre cajas ni usa objetos. Los números son un suelo: un jugador normal debería ganar algo más.

## Objetivo (petición del usuario)

| | Objetivo |
|---|---|
| Piso sin perder ningún combate | 85-90 % |
| Ganar al jefe | 70-80 % |
| Temporada larga | 10 pisos, de nivel 1 a 11-12; las habilidades principales llegan a la Maestría hacia el jefe final |

## La temporada (10 pisos)

Dos pisos por planta. El primero acaba en un **guardián** (el enemigo más duro de la planta, en élite y con 2 acciones); el segundo, en el **jefe de la planta**. Datos: `content/willy/data/floors.json → pisos`.

| Piso | Planta | Nivel al entrar | Salas | Reloj | Experiencia del piso |
|---|---|---|---|---|---|
| 1 | Castro Sumergido: Las calles anegadas | 1 | 7-9 | 7:00 | 78 |
| 2 | Castro Sumergido: La lonja | 2 | 11-14 | 12:00 | 130 |
| 3 | Hipermercado Eterno: Pasillos infinitos | 3 | 9-11 | 11:45 | 208 |
| 4 | Hipermercado Eterno: La trastienda | 4 | 11-14 | 14:30 | 299 |
| 5 | La Verbena Sin Fin: Las barracas | 5 | 9-11 | 12:30 | 390 |
| 6 | La Verbena Sin Fin: La plaza mayor | 6 | 11-14 | 15:45 | 520 |
| 7 | Balneario Glaciar: Los vestuarios | 7 | 9-11 | 12:15 | 650 |
| 8 | Balneario Glaciar: Las termas | 8 | 11-14 | 19:30 | 780 |
| 9 | El Plató: Los pasillos de producción | 9 | 9-11 | 11:15 | 910 |
| 10 | El Plató: El plató principal | 10 | 11-14 | 15:15 | 1105 |

**Curva de nivel:** se entra en el piso N a nivel N y se sale a nivel N+1. La experiencia de cada piso es lo que falta para el siguiente nivel, ×1,3 (no hace falta limpiar todas las salas). Las habilidades de clase de nivel 9 llegan en el piso 8-9, así que se usan en el último tercio de la temporada.

## Reloj (recalibrado el 2026-10-23)

Petición del usuario: «hay demasiado tiempo por planta». Antes, una partida normal salía de casi cualquier piso con más de la mitad del reloj, y el derrumbe no llegaba nunca.

**Cómo se mide** (`tests/content/willy-clock-probe.test.ts`, `SIM_CLOCK=30`: 30 pisos generados por piso, en Concursante). El simulador de combate salta de sala en sala, así que el reloj se reconstruye:
- Andar: 1 s por casilla, el camino más corto entre salas en el mapa real.
- Combate: 15 s por ronda. Las rondas se miden jugando cada combate con la IA (de 1,5 a 3,8 rondas por pelea, según el piso). Los combates de guardián y jefe paran el reloj.
- 3 s por cofre abierto.
- En el piso 1, el reloj empieza tras la primera victoria (el tutorial).

Tres jugadores:
- **Directo:** el camino crítico hasta la escalera, peleando lo que hay en él.
- **Normal:** todas las salas con combate y sus cofres.
- **Completo:** todas las salas y todos los cofres.

La IA anda en línea recta y sin dudar; una persona da más vueltas. Los números de «ahora» suman un 15 % de tiempo a cada recorrido para tenerlo en cuenta.

**Reloj que queda al bajar la escalera** (antes → ahora, Concursante; p50 = mediana, p90 = el 10 % más lento):

| Piso | Reloj antes → ahora | Directo p90 | Normal p50 | Normal p90 | Completo p50 | Completo p90 |
|---|---|---|---|---|---|---|
| 1 | 23:00 → 7:00 | 88 % → 54 % | 84 % → 39 % | 77 % → 14 % | 78 % → 18 % | 74 % → 3 % |
| 2 | 26:00 → 12:00 | 82 % → 55 % | 71 % → 28 % | 65 % → 14 % | 68 % → 20 % | 63 % → 9 % |
| 3 | 19:33 → 12:15 | 68 % → 42 % | 59 % → 25 % | 48 % → 5 % | 52 % → 11 % | 44 % → -2 % |
| 4 | 22:06 → 15:00 | 68 % → 45 % | 56 % → 26 % | 43 % → 4 % | 47 % → 10 % | 35 % → -10 % |
| 5 | 18:24 → 12:30 | 66 % → 43 % | 55 % → 24 % | 42 % → 1 % | 50 % → 15 % | 39 % → -2 % |
| 6 | 20:48 → 16:30 | 62 % → 44 % | 50 % → 28 % | 30 % → -1 % | 42 % → 16 % | 28 % → -4 % |
| 7 | 17:15 → 12:15 | 64 % → 42 % | 53 % → 24 % | 38 % → 0 % | 47 % → 14 % | 37 % → -2 % |
| 8 | 19:30 → 19:30 | 49 % → 41 % | 34 % → 25 % | 11 % → -3 % | 27 % → 16 % | 8 % → -5 % |
| 9 | 17:15 → 11:45 | 68 % → 47 % | 53 % → 21 % | 39 % → -3 % | 51 % → 16 % | 36 % → -7 % |
| 10 | 19:30 → 16:00 | 62 % → 47 % | 44 % → 22 % | 31 % → 3 % | 38 % → 13 % | 25 % → -4 % |

Lectura:
- **Directo:** siempre llega con margen. Queda entre el 41 y el 55 % del reloj en el 90 % de los casos, así que ningún piso es imposible.
- **Normal:** sale con un 21-28 % en la mediana (39 % en el piso 1 y 28 % en el 2, más suaves para aprender). El 10 % más lento de los pisos 5-9 roza el derrumbe.
- **Completo:** queda un 10-16 % en la mediana y el 10 % más lento se derrumba (pisos 3-10). En los pisos 1 y 2, explorarlo todo cabe por poco (3 % y 9 % en el p90).
- **Turista** (×1,5): queda un 31-43 % incluso en el 10 % más lento de las partidas normales, y un 40-47 % explorándolo todo. Nunca va con prisa.
- **Prime time**, suavizado el 2026-10-23 a petición del usuario («suaviza un poquillo»). Ahora tiene reloj ×0,95 y los enemigos reciben el 85 % del daño; antes, ×0,8 y 80 %. Con los dos a la vez: los enemigos más duros alargan los combates y eso también gasta reloj. Medido con los combates de Prime time (`SIM_DIFICULTAD=primetime`) y el 15 % humano: la partida normal llega con un 10-18 % en la mediana en los pisos 3-10 (un 33 % en el piso 1 y un 24 % en el 2), y el directo con un 30-45 % en el p90. Antes, la partida normal llegaba con un 2-10 %.

El piso 8 se queda en 19:30: sus combates son los más largos (3,8 rondas por pelea) y ya iba justo.

## Curva de combate (recalibrada el 2026-10-29)

Petición del usuario: «llega un momento en el que los enemigos hacen muy poco daño y tienen mucha vida, con lo que los combates se vuelven larguísimos».

**El problema:** la vida de Willy se triplica en la temporada (unos 26 de vida a nivel 1, 52-76 a nivel 11), pero el daño de los enemigos casi no cambia.
- Sus dados (1d4 en Castro, 1d6-1d8 en el Plató) no suman fuerza.
- A partir del piso 6, un golpe enemigo quitaba solo el 7-10 % de la vida.
- Encima, `vidaEnemigos` les ponía un 25 % más de vida en los pisos 6, 8 y 10.
- Resultado: enemigos que aguantan mucho y no asustan.
- Además, los guardianes y los jefes caían en 2-4 rondas: no parecían jefes.

**Cómo se mide** (`tests/content/willy-fight-probe.test.ts`, `SIM_FIGHTS=4`): cada piso con las 9 clases × 4 semillas, a nivel esperado y jugado por la IA. Para cada combate se cuentan:
- las rondas;
- los aciertos enemigos y cuánto quita cada golpe, como % de la vida máxima de quien lo recibe;
- los aciertos de Willy;
- la vida enemiga total dividida entre el daño que hace el grupo por ronda.

**Palancas nuevas** (`floors.json → equilibrio`):
- `danoExtra`: daño fijo que se suma al dado de los enemigos normales y del guardián.
- `ataqueExtra`: bono para acertar.

**Valores:**
- Más daño y menos vida. `danoExtra`: +1 en los pisos 7, 8 y 10, y +2 en el 9. `ataqueExtra`: +1 en los pisos 8-10.
- Vida enemiga: ×0,9 en los pisos 3, 4, 5, 7 y 9, y ×1 en los pisos 6, 8 y 10 (antes ×1 y ×1,25).
- Guardián: vida ×3,5 (antes ×2).
- Jefes: vida ×0,45 en el Centollo (27), la Encargada (41) y el Gigantón (54), y ×0,55 en la Socorrista (83). Antes: 18, 23, 38 y 50. El Presentador no cambia.
- Con más vida que esto (guardián ×4,5, jefes ×0,55-0,6), el Funcionario y el Influencer se atascaban en la Encargada y el Gigantón. Se probó y se descartó.

**Antes → ahora** (la IA de los dos lados; una persona tarda más rondas que la IA, así que lo que cuenta es la tendencia):

| Piso | Rondas (normal, p50/p90) | Rondas (guardián/jefe, p50/p90) | Daño por golpe enemigo (% de la vida) | Acierto enemigo | Vida enemiga ÷ daño del grupo por ronda | Jefe ganado | Piso sin caer |
|---|---|---|---|---|---|---|---|
| 1 | 2/3 → 2/3 | 2/2 → 2/3 | 19 % → 15 % | 61 % → 66 % | 1.2 → 1.3 | 100 % → 100 % | 100 % → 100 % |
| 2 | 1/2 → 1/2 | 2/4 → 3/5 | 21 % → 21 % | 67 % → 59 % | 1.0 → 1.0 | 100 % → 97 % | 85 % → 86 % |
| 3 | 3/5 → 3/4 | 3/4 → 4/6 | 13 % → 13 % | 70 % → 60 % | 2.4 → 2.4 | 96 % → 97 % | 96 % → 97 % |
| 4 | 3/4 → 3/4 | 4/6 → 5/7 | 14 % → 11 % | 60 % → 67 % | 2.3 → 2.1 | 96 % → 94 % | 96 % → 94 % |
| 5 | 3/4 → 3/4 | 3/4 → 4/7 | 11 % → 10 % | 61 % → 60 % | 2.7 → 2.6 | 100 % → 100 % | 100 % → 89 % |
| 6 | 3/5 → 3/4 | 3/6 → 5/7 | 8 % → 9 % | 67 % → 65 % | 3.0 → 2.4 | 94 % → 96 % | 59 % → 64 % |
| 7 | 3/5 → 3/6 | 4/5 → 5/9 | 12 % → 13 % | 59 % → 68 % | 2.7 → 2.7 | 100 % → 91 % | 100 % → 89 % |
| 8 | 4/6 → 3/6 | 4/5 → 7/9 | 10 % → 10 % | 69 % → 66 % | 3.4 → 3.0 | 100 % → 97 % | 100 % → 92 % |
| 9 | 3/4 → 3/4 | 3/4 → 5/10 | 11 % → 11 % | 53 % → 65 % | 2.0 → 2.0 | 100 % → 97 % | 100 % → 94 % |
| 10 | 3/5 → 3/4 | 7/12 → 8/13 | 7 % → 9 % | 73 % → 57 % | 2.6 → 2.2 | 78 % → 75 % | 78 % → 75 % |

Lectura:
- **Combates normales:** 3 rondas de mediana y 4-6 en el p90, como antes. Ahora con menos vida enemiga, así que una persona, que no remata tan bien como la IA, debería notarlo más.
- **Golpe enemigo:** quita un 9-13 % de la vida en los pisos 3-10, dentro del objetivo del 8-15 %. Antes bajaba al 7-8 % en los pisos 6 y 10. El cambio en los combates normales es pequeño: lo que más cambia es la vida enemiga, que baja entre un 10 y un 20 %.
- **Guardianes y jefes:** duran 4-8 rondas desde el piso 3 (antes 3-4, en el piso 10 ya eran 7). El Centollo (piso 2, el primer jefe) se queda en 3 a propósito: es el primero. Los guardianes quedan en 4-5 rondas, algo por debajo de las 6-10 pedidas: más vida bajaba demasiado las victorias.
- **Victorias:** el jefe se gana un 91-100 % de las veces en los pisos 1-9 y un 75 % en el 10.
- **Temporada** (27 temporadas, `SIM_SEASON=3`):
  - Se terminan 25 de 27, como antes. El Funcionario y el Influencer pierden una cada uno.
  - Piso sin perder, pisos 1-10: 93 / 81 / 100 / 93 / 85 / 92 / 88 / 100 / 80 / 80 % (antes 93 / 89 / 85 / 96 / 89 / 93 / 100 / 85 / 100 / 76 %).
- **Reloj:** se ha vuelto a medir. Los combates algo más cortos dejan un 3-7 % más de reloj, así que se recortan los relojes de los pisos 3 (11:45), 4 (14:30), 6 (15:45), 9 (11:15) y 10 (15:15). La partida normal sigue saliendo con un 23-28 % del reloj en la mediana.

## Curva de habilidades (subida por uso)

Umbrales: 8 / 24 / 48 / 80 usos para los niveles 2-5 (red-g: 6 / 16 / 30 / 50 / 75). Resultado en la temporada simulada, mediana de las 27 temporadas:

| Piso | Habilidad más usada | Segunda habilidad | Temporadas con alguna Maestría |
|---|---|---|---|
| 1 | nivel 1 | 1 | 0 % |
| 2-3 | nivel 2 | 1 | 0 % |
| 4-5 | nivel 3 | 1 | 19-27 % |
| 6-7 | nivel 4 | 1 | 28-32 % |
| 8 | nivel 5 (Maestría) | 1 | 56 % |
| 9 | 5 | 1 | 62 % |
| 10 | 5 | 2 | 71 % |

La IA se apoya casi siempre en una sola habilidad; una persona reparte más. Por eso la segunda habilidad sube poco aquí, y en partida real debería ir uno o dos niveles por detrás de la primera.

## Palancas

| Palanca | Dónde |
|---|---|
| Compañero por clase | `rulesets/willy/data/companions.json` (ver `RULESET.md` → «Compañeros») |
| Pausa publicitaria (vida al acabar cada combate) | `rulesets/willy/data/willy.json → pausaPublicitaria.vida` (25 %) |
| Regeneración al andar | `willy.json → regeneracion` (5 % cada 4 casillas) |
| Acciones de los enemigos normales | `floors.json → equilibrio.accionesEnemigo` (1; élites, rivales y jefes: 2) |
| Presupuesto de enemigos, vida de los enemigos, élites, jefes y guardián por piso | `floors.json → equilibrio` (`presupuesto`, `vidaEnemigos`, `elites`, `jefes`, `guardian`) |
| La primera pelea | `equilibrio.primeraPelea` (dos ratas como mucho) |
| Umbrales de las habilidades por uso | `rulesets/willy/data/classes.json → umbralesHabilidad` |
| El Share del Presentador | `content/willy/show.ts` (`votoPorRonda`, `drenajeEnAntena`, `curacionDivisor`...) |

Valores actuales (2026-10-29; daño y ataque extra: «Curva de combate»):

| Piso | Presupuesto | Vida enemigos | Élites | Jefe: vida | Jefe: daño |
|---|---|---|---|---|---|
| 1 | ×0,6 | ×0,8 | 0 % | guardián ×3,5 | — |
| 2 | ×0,4 | ×0,8 | 10 % | ×0,45 (Centollo, 27) | 1d6 |
| 3 | ×1 | ×0,9 | 15 % | guardián | — |
| 4 | ×0,7 | ×0,9 | 20 % | ×0,45 (Encargada, 41) | 1d8 |
| 5 | ×0,75 | ×0,9 | 25 % | guardián | — |
| 6 | ×0,65 | ×1 | 30 % | ×0,45 (Gigantón, 54) | 1d10 |
| 7 | ×0,8 | ×0,9 (+1 daño) | 35 % | guardián | — |
| 8 | ×0,8 | ×1 (+1 daño, +1 ataque) | 40 % | ×0,55 (Socorrista, 83) | 1d8 |
| 9 | ×0,55 | ×0,9 (+2 daño, +1 ataque) | 45 % | guardián | — |
| 10 | ×0,55 | ×1 (+1 daño, +1 ataque) | 50 % | ×0,27 (Presentador, 59) + Share | 2d6 |

Compañeros reforzados en esta pasada: Doña Rosario (Tasador: vida 24, +4 por nivel, ataque 6), Iker (Funcionario: vida 18, ataque 5), Kevin (Influencer: vida 22, +4 por nivel, ataque 6, 1d8) y Plata (Mimo: ataque 5, 1d6).

## Resultados (27 temporadas: 9 clases × 3 semillas, 2026-10-18)

Con enemigos que usan sus habilidades especiales (IA de monstruos del agente meta), el espectáculo cargado y la regeneración al andar.

| Piso | Combates por piso | Piso sin perder | Jefe a la primera | Nivel al salir |
|---|---|---|---|---|
| 1 | 5,7 | 96 % | 100 % | 1,6 |
| 2 | 9,0 | 74 % | 96 % | 3 |
| 3 | 8,2 | 81 % | 89 % | 4 |
| 4 | 9,6 | 100 % | 100 % | 5 |
| 5 | 7,3 | 81 % | 96 % | 6 |
| 6 | 9,3 | 88 % | 96 % | 7 |
| 7 | 7,7 | 100 % | 100 % | 8 |
| 8 | 9,5 | 88 % | 92 % | 9 |
| 9 | 7,8 | 100 % | 100 % | 10 |
| 10 | 10,6 | 88 % | 88 % | 11 |

**Temporadas terminadas:** 24 de 27 (89 %). Por clase:
- 3 de 3: Butanero, Bardo, Socorrista, Ingeniero, Funcionario y Jugador de basket.
- 2 de 3: Influencer, Tasador y Mimo. Las tres temporadas perdidas gastaron sus 15 repeticiones antes del piso 3 en el caso del Influencer, y entre los pisos 6 y 9 en las otras dos.

Antes de esta pasada (la misma temporada sin calibrar): los pisos de jefe (2, 4 y 6) se pasaban sin perder solo el 44-56 % de las veces, y el Tasador no terminaba ninguna temporada.

### Segunda pasada (27 temporadas, 2026-10-18)

Con todo junto: Golpe de valor, el piso 2 ajustado, las fases del Presentador y el final.

| Piso | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Piso sin perder | 93 % | 89 % | 85 % | 96 % | 89 % | 93 % | 100 % | 85 % | 100 % | 76 % |
| Jefe a la primera | 100 % | 96 % | 100 % | 96 % | 100 % | 96 % | 100 % | 85 % | 100 % | 76 % |

**Temporadas terminadas:** 25 de 27 (93 %). El Bardo y el Funcionario terminaron 2 de 3; las demás clases, 3 de 3. El Tasador pasa de 2 de 3 a 3 de 3.

**Curva de habilidades:** la principal llega a la Maestría en el piso 9. El 64 % de las temporadas la tienen al final.

**El jefe del piso 8 (la Socorrista Mayor):** en el simulador de un solo piso, a nivel esperado, cae el 94 % de las veces. Pero en 4 de las 27 temporadas costó 10 repeticiones o más, y las dos temporadas perdidas se perdieron ahí. Es un muro para algunos grupos más que un jefe difícil en general. **Ajustado (2026-10-23, aprobado por el usuario):** su daño baja de 1d10 a 1d8 en `jefes['8']`.

## Pendiente

- **Las fases del Presentador, medidas (2026-10-18):** ya están todas (Ronda de preguntas, Pausa publicitaria, Gran final con la parrilla de focos y «Sin reflejo»).
  - Se midió solo el piso 10, a nivel esperado (9 clases × 6 semillas, `simulateFloor`): el jefe cae el 76 % de las veces, sin combates atascados, y Willy acaba con el 68 % de la vida.
  - Está dentro del objetivo, así que `jefes['10']` se queda como estaba (vida ×0,27, daño 2d6).
  - Las clases que más sufren contra él son el Tasador (2 de 6; en el simulador no lleva objetos, así que no usa el Golpe de valor), el Ingeniero (3 de 6) y el Funcionario (3 de 6).
  - La parrilla de focos solo la usa un jugador, no la IA: en partida el jefe será algo más fácil.
- **El piso 2, ajustado (2026-10-18):** la causa eran el Influencer (5 de 16 pisos sin perder) y el Mimo (9 de 16), que llegan al Centollo casi sin daño; las demás clases pasaban de largo. Se reforzaron sus compañeros y se bajó un poco el presupuesto (×0,4). Con 144 temporadas cortas (pisos 1-2, 9 clases × 16 semillas), el piso 2 se pasa sin perder el 86 % de las veces (antes el 81 %, y el 74 % con 27) y el jefe cae a la primera el 94 %. Ninguna clase baja del 75 %. Los compañeros más fuertes facilitan algo los pisos siguientes, que ya iban sobrados.
- **Pisos 4, 7 y 9:** al 100 %, quizá se pueden endurecer. Primero hay que ver las partidas reales.
- **Golpe de valor del Tasador** ya funciona (2026-10-18): 1d6 más la mitad del valor del objeto lanzado. Falta medir cuánto ayuda al Tasador en la temporada.
- **Fuera de la simulación:** las dificultades Turista y Prime time, los objetos y las cajas de botín.
