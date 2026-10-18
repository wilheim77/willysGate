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

## Resultados

Ver la tabla de abajo (se rellena con cada ajuste).
