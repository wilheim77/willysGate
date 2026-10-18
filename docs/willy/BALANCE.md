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
| 1 | Castro Sumergido: Las calles anegadas | 1 | 7-9 | 23:00 | 78 |
| 2 | Castro Sumergido: La lonja | 2 | 11-14 | 26:00 | 130 |
| 3 | Hipermercado Eterno: Pasillos infinitos | 3 | 9-11 | 19:33 | 208 |
| 4 | Hipermercado Eterno: La trastienda | 4 | 11-14 | 22:06 | 299 |
| 5 | La Verbena Sin Fin: Las barracas | 5 | 9-11 | 18:24 | 390 |
| 6 | La Verbena Sin Fin: La plaza mayor | 6 | 11-14 | 20:48 | 520 |
| 7 | Balneario Glaciar: Los vestuarios | 7 | 9-11 | 17:15 | 650 |
| 8 | Balneario Glaciar: Las termas | 8 | 11-14 | 19:30 | 780 |
| 9 | El Plató: Los pasillos de producción | 9 | 9-11 | 17:15 | 910 |
| 10 | El Plató: El plató principal | 10 | 11-14 | 19:30 | 1105 |

**Curva de nivel:** se entra en el piso N a nivel N y se sale a nivel N+1. La experiencia de cada piso es lo que falta para el siguiente nivel, ×1,3 (no hace falta limpiar todas las salas). Las habilidades de clase de nivel 9 llegan en el piso 8-9, así que se usan en el último tercio de la temporada.

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

Valores actuales (2026-10-18):

| Piso | Presupuesto | Vida enemigos | Élites | Jefe: vida | Jefe: daño |
|---|---|---|---|---|---|
| 1 | ×0,6 | ×0,8 | 0 % | guardián ×2 | — |
| 2 | ×0,4 | ×0,8 | 10 % | ×0,3 (Centollo, 18) | 1d6 |
| 3 | ×1 | ×1 | 15 % | guardián | — |
| 4 | ×0,7 | ×1 | 20 % | ×0,25 (Encargada, 23) | 1d8 |
| 5 | ×0,75 | ×1 | 25 % | guardián | — |
| 6 | ×0,65 | ×1,25 | 30 % | ×0,32 (Gigantón, 38) | 1d10 |
| 7 | ×0,8 | ×1 | 35 % | guardián | — |
| 8 | ×0,8 | ×1,25 | 40 % | ×0,33 (Socorrista, 50) | 1d10 |
| 9 | ×0,55 | ×1 | 45 % | guardián | — |
| 10 | ×0,55 | ×1,25 | 50 % | ×0,27 (Presentador, 59) + Share | 2d6 |

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
