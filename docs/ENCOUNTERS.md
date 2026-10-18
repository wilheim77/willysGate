# Combates del acto de *Intereses*

> Agente de mapas, 2026-10-18. Es la lista para el agente de progresión, que está pasando la subida de nivel a experiencia. El grupo empieza a nivel 3 y debe llegar a nivel 5 antes del jefe. Los PX salen de `rulesets/dnd5e/data/monsters.json` (campo `xp`, SRD), sumando todos los participantes de cada combate. Lo genera `scratchpad/mapas/xp.py` a partir de los mapas, `templates.json` y `cast.json`.

## Tabla

| Mapa | Combate | Enemigos (monstruo SRD) | PX totales | PX por personaje (grupo de 4) | Nivel previsto | Cuándo |
|---|---|---|---|---|---|---|
| `camino` | Perros carroñeros (tutorial) | 2× mastiff, 1× giant_rat | 75 | 18 | 3 | Obligatorio |
| `camino` | Mineros hambrientos | 3× bandit, 1× thug | 175 | 43 | 3 | Evitable hablando |
| `barranco` | Lobos del barranco | 4× wolf | 200 | 50 | 3 | Opcional (mapa lateral) |
| `plaza` | Fanáticos del juicio | 3× bandit | 75 | 18 | 3 | Evitable (juicio a golpes) |
| `callejon` | Cobradores de Lisandro | 2× thug, 2× bandit | 250 | 62 | 3 | En el paso plaza ↔ calles |
| `escorial` | Los Sinpaga | 1× veteran, 4× bandit, 1× thug | 900 | 225 | 4 | Evitable hablando (sinpaga_jefe) |
| `abadia` | D1 · asalto con la Cuadrilla | 4× guard, 1× knight | 800 | 200 | 4 | Ruta d1_cuadrilla (con 5 aliados) |
| `abadia` | D1 · defensa con la guardia | 1× veteran, 5× bandit | 825 | 206 | 4 | Ruta d1_abadia (con 4 aliados) |
| `tunel` | Callados del túnel | 3× zombie, 2× giant_rat, 2× skeleton | 300 | 75 | 5 | Ruta del pozo (tras D1) |
| `mina` | Callados en los andamios | 3× zombie, 1× ghoul | 350 | 87 | 5 | Obligatorio |
| `mina` | Callados de la cripta | 2× zombie | 100 | 25 | 5 | Ruta de la cripta |
| `mina` | Emboscada de la Galería Sellada | 2× zombie, 1× ghoul | 300 | 75 | 5 | Tras D2 |
| `boveda` | Brea (jefe) | 1× gladiator, 1× thug, 3× zombie, 1× ghoul | 2250 | 562 | 5 | Obligatorio |

**Notas:**
- **Combates excluyentes:**
  - Los dos de D1 (asalto o defensa) son excluyentes.
  - Las rutas del túnel y de la cripta son alternativas para bajar a la mina (también se puede ir por la bocamina).
  - Los Sinpaga y los mineros pueden acabar hablando, sin PX de combate; si se quiere premiar esa vía, la progresión puede dar PX por la escena.
- **Total de un recorrido típico** (camino, barranco, plaza sin pelea, callejón, Escorial a golpes, D1, túnel, andamios, Galería Sellada y jefe): unos 5.000-5.500 PX de grupo, es decir, unos 1.300 por personaje. Con los umbrales del SRD (nivel 4 a 2.700 y nivel 5 a 6.500 por personaje) no basta. **El agente de progresión debe fijar umbrales propios** (por ejemplo, nivel 4 a unos 350 por personaje, antes del Escorial, y nivel 5 a unos 900, antes de la mina) o multiplicar los PX.
- **El jefe no da nivel:** sus PX llegan cuando el acto ya se ha resuelto.

## Equilibrio

Simulaciones con el motor real, la IA a ambos lados y el grupo a su nivel (`scratchpad/mapas/sim.ts` y `variants.probe.ts`, 24 semillas por variante). Objetivo: 85-95 % de victorias con 1-2 caídas, y para el jefe 70-85 % con 2-3 caídas.

| Combate | Variante elegida | Resultado simulado |
|---|---|---|
| Mineros (L3, grupo de 3) | Sin cambios | 100 %, 1,1 caídas (tutorial; con un jugador que estabilice no hay muertes) |
| Fanáticos (L3, 3) | Sin cambios | 100 %, 0,1 caídas (fácil a propósito) |
| Sinpaga (L4) | Jefe → `veteran` (E3) | 96 %, 2,9 caídas |
| D1 asalto (L5, con 5 aliados) | Sin cambios | 100 %, 0 caídas. Variantes más duras: sargento `knight` + 2 `veteran` (100 %, 1,0 caídas); + 4 `veteran` (83 %, 3,3 caídas) |
| D1 defensa (L5, con 4 aliados) | Sin cambios | 100 %, 0,1 caídas. Variante más dura: Odda `veteran` + 5 `thug` (100 %, 2,6 caídas) |
| Andamios, cripta, Galería Sellada (L5) | `zombie`/`ghoul` | 100 %, 0-0,2 caídas |
| Jefe (L6) | Brea `gladiator`, Ivo `thug`, Callados `zombie`/`ghoul` | Pendiente de volver a simular a L5 con el bestiario nuevo |

**Lo que limita el equilibrio: no hay descansos.** La simulación que encadena los combates (`tests/playthrough/goldenPathMatrix.test.ts`) aniquila al grupo en la mina o con el jefe en cuanto los Callados pasan a `ghast`/`wight` (M4: 100 % y 1,4 caídas por separado) o Brea lleva un lugarteniente fuerte. Por separado esos combates entran en el objetivo, pero encadenados sin recuperar PG no. Por eso los Callados se quedan de momento en `zombie`/`ghoul`. Para endurecer la mina y el jefe hace falta un **descanso** antes de la mina, por ejemplo un descanso corto en el campamento del pozo o la cripta, o uno largo tras D1. Es trabajo del motor o del ruleset, y se ha propuesto a la sesión principal.
