# Willy el mazmorrero: equilibrio

> Cómo se mide y se ajusta la dificultad. Simulador: `content/willy/sim/balance.ts`. Tests: `tests/content/willy-balance-*.test.ts` (planta 1 en `npm test`, las cinco con `QA_DEEP=1`).

## Qué se mide

Willy y su compañero, **jugados por la IA de los dos lados**, recorren una planta generada de verdad (semilla, salas, enemigos, jefe) al **nivel esperado** a mitad de planta: 2, 5, 7, 9 y 11. Las salas se juegan en el orden del grafo (de menos a más profundas) y el jefe al final. La vida pasa de un combate al siguiente; entre combates solo vuelve lo que dan las reglas (la Pausa publicitaria y la energía).

- **Llega al jefe:** gana todos los combates normales de la planta.
- **Jefe:** gana al jefe, una vez allí.
- **Caídas del compañero:** media por planta (el compañero caído no vuelve hasta la planta siguiente).

La IA juega peor que una persona: no se retira, no prepara combos, no usa objetos ni el entorno a propósito. Los números son un suelo: un jugador normal debería ganar algo más.

## Objetivo (petición del usuario)

| | Objetivo |
|---|---|
| Llegar al jefe (planta «limpia») | 85-90 % |
| Ganar al jefe | 70-80 % |
| Caídas | 1-2 por planta entre Willy y su compañero |

## Palancas

| Palanca | Dónde | Valor |
|---|---|---|
| Compañero por clase | `rulesets/willy/data/companions.json` | ver `RULESET.md` → «Compañeros» |
| Pausa publicitaria (vida al acabar cada combate) | `rulesets/willy/data/willy.json` → `pausaPublicitaria.vida` | 25 % |
| Acciones de los enemigos normales | `content/willy/data/floors.json` → `equilibrio.accionesEnemigo` | 1 (élites, rivales y jefes: 2) |
| Presupuesto de enemigos por planta | `equilibrio.presupuesto` | ver tabla |
| Vida y daño de los jefes por planta | `equilibrio.jefes` | ver tabla |

Valores actuales (2026-10-18):

| Planta | Nivel | Presupuesto | Jefe: vida | Jefe: daño |
|---|---|---|---|---|
| 1 | 2 | ×0,9 (y la primera pelea, 2 como máximo: dos ratas) | ×0,5 (30) | 1d10 |
| 2 | 5 | ×1 | ×0,45 (41) | 1d10+2 |
| 3 | 7 | ×0,75 | ×0,5 (60) | 2d6 |
| 4 | 9 | ×0,8 | ×0,45 (68) | 2d6 |
| 5 | 11 | ×0,55 | ×0,32 (70) | 2d6+1 |

Además: los compañeros de las clases de apoyo (Influencer, Bardo, Tasador, Funcionario) pegan más fuerte que los de las clases de golpe, porque la IA juega peor el apoyo.

## Resultados (9 clases × 6 semillas por planta, 270 partidas)

| Planta | Llega al jefe | Gana al jefe | Planta entera | Caídas del compañero | Vida de Willy al final |
|---|---|---|---|---|---|
| 1 | 100 % | 83 % | 83 % | 0,24 | 71 % |
| 2 | 94 % | 78 % | 74 % | 0,41 | 62 % |
| 3 | 91 % | 78 % | 70 % | 0,37 | 51 % |
| 4 | 85 % | 76 % | 65 % | 0,33 | 57 % |
| 5 | 93 % | 82 % | 76 % | 0,52 | 62 % |

Antes de los compañeros y los ajustes (Willy solo, mismo simulador): planta 1, 11 % entera; el Centollo ganaba 4 de cada 5 veces.

**Por clase** (las 5 plantas juntas, planta entera): Socorrista 97 %, Jugador de basket 93 %, Ingeniero 93 %, Butanero 87 %, Mimo 70 %, Bardo 63 %, Influencer 60 %, Funcionario 57 %, Tasador 43 %. La diferencia es sobre todo de la IA: las clases de apoyo y de control (Tasador, Funcionario) dependen de combos que la IA no prepara. Si en las partidas de prueba el Tasador se nota duro, el siguiente paso es darle más daño propio (Golpe de valor) antes que tocar a los enemigos.

## Curación fuera de combate (2026-10-18)

Regla (`willy.json → regeneracion`): fuera de combate, 5 % de la vida máxima por cada 4 casillas que anda Willy, para él y para su compañero si sigue en pie. Al llegar al Camerino, vida completa. La Pausa publicitaria (25 %) se mantiene.

Medida con el simulador de 10 plantas, en una copia local con un parche: al pasar de una sala a la siguiente, el grupo se cura lo que andaría (distancia de Chebyshev hasta la entrada de la sala). La configuración: 9 clases × 3 semillas × 10 plantas, con y sin la regla. El parche está en manos del agente de Willy, que está reescribiendo `balance.ts`.

| Planta | Planta entera sin → con | Llega al jefe sin → con | Vida al final sin → con |
|---|---|---|---|
| 1 | 70 → 74 % | 78 → 78 % | 67 → 70 % |
| 2 | 22 → 26 % | 59 → 63 % | 19 → 22 % |
| 3 | 56 → 67 % | 67 → 78 % | 46 → 57 % |
| 4 | 44 → 63 % | 70 → 81 % | 33 → 50 % |
| 5 | 89 → 89 % | 96 → 96 % | 78 → 79 % |
| 6 | 44 → 59 % | 74 → 89 % | 36 → 47 % |
| 7 | 52 → 59 % | 70 → 81 % | 38 → 49 % |
| 8 | 48 → 59 % | 59 → 93 % | 33 → 48 % |
| 9 | 74 → 85 % | 78 → 85 % | 69 → 78 % |
| 10 | 67 → 70 % | 89 → 100 % | 52 → 53 % |

Resultado: de media, de 57 % a 65 % de plantas enteras. Se nota sobre todo en las plantas largas: se llega con más vida a las últimas salas. Ninguna planta se vuelve un paseo: la 2 sigue en el 26 % y los jefes siguen ganando entre un 5 % y un 59 % de las veces. Con la regla, las plantas siguen siendo difíciles, y sin ella estaban por debajo del objetivo de llegar al jefe (85-90 %). No hace falta bajar la Pausa publicitaria. Si sobra facilidad cuando la IA use objetos y cajas, la primera palanca es `regeneracion.vida` (5 % → 3 %).

## Pendiente

- La IA de Willy no empuja a propósito ni usa barriles: cuando lo haga, volver a medir (seguramente sobrará dificultad y se podrá subir el presupuesto).
- Objetos y cajas de botín no entran en la simulación.
- Dificultades Turista y Prime time: aplicar sus multiplicadores sobre estos valores.
