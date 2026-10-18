# Combates del acto de *Intereses*

> Agente de mapas, 2026-10-18. Es la lista para el agente de progresión, que está pasando la subida de nivel a experiencia. El grupo empieza a nivel 3 y debe llegar a nivel 5 antes del jefe. Los PX salen de `rulesets/dnd5e/data/monsters.json` (campo `xp`, SRD), sumando todos los participantes de cada combate. Lo genera `scratchpad/mapas/xp.py` a partir de los mapas, `templates.json` y `cast.json`.

## Tabla

| Mapa | Combate | Enemigos (monstruo SRD) | PX totales | PX por personaje (grupo de 4) | Nivel previsto | Cuándo |
|---|---|---|---|---|---|---|
| `camino` | Perros carroñeros (tutorial) | 2× mastiff, 1× giant_rat | 75 | 18 | 3 | Obligatorio |
| `camino` | Mineros hambrientos | 3× bandit, 1× thug | 175 | 43 | 3 | Evitable hablando |
| `barranco` | Lobos del barranco | 4× wolf | 200 | 50 | 3 | Opcional (mapa lateral) |
| `plaza` | Fanáticos del juicio | 2× cultist, 1× cult_fanatic | 500 | 125 | 3 | Evitable (juicio a golpes) |
| `callejon` | Cobradores de Lisandro | 1× thug, 3× bandit | 175 | 43 | 3 | En el paso plaza ↔ calles |
| `escorial` | Callado del pozo | 1× zombie | 50 | 12 | 4 | Opcional (atacarlo en callado_pozo) |
| `escorial` | Los Sinpaga | 1× bandit_captain, 3× bandit, 1× acolyte, 1× thug | 675 | 168 | 4 | Evitable hablando (sinpaga_jefe) |
| `abadia` | D1 · asalto con la Cuadrilla | 3× guard, 1× acolyte, 1× knight | 825 | 206 | 4 | Ruta d1_cuadrilla (con 5 aliados) |
| `abadia` | D1 · defensa con la guardia | 1× veteran, 5× bandit | 825 | 206 | 4 | Ruta d1_abadia (con 4 aliados) |
| `tunel` | Callados del túnel | 3× zombie, 2× giant_rat, 2× skeleton | 300 | 75 | 5 | Ruta del pozo (tras D1) |
| `mina` | Callados en los andamios | 3× zombie, 1× ghast | 600 | 150 | 5 | Obligatorio |
| `mina` | Callados de la cripta | 2× zombie | 100 | 25 | 5 | Ruta de la cripta |
| `mina` | Emboscada de la Galería Sellada | 2× zombie, 1× ghast | 550 | 137 | 5 | Tras D2 |
| `boveda` | Brea (jefe) | 1× foreman, 4× zombie, 1× ghast | 2950 | 737 | 5 | Obligatorio |

**Notas:**
- **Combates excluyentes:**
  - Los dos de D1 (asalto o defensa) son excluyentes.
  - Las rutas del túnel y de la cripta son alternativas para bajar a la mina (también se puede ir por la bocamina).
  - Los Sinpaga y los mineros pueden acabar hablando, sin PX de combate; la progresión da PX por la escena (`gainProgress`).
- **Umbrales** (`content/intereses/levelups.json`, del agente de progresión): nivel 4 a 1.000 PX de grupo y nivel 5 a 1.500. Un jugador normal llega a nivel 4 tras el callejón y a nivel 5 justo después de los Sinpaga. El acto termina a nivel 5.
- **El jefe no da nivel:** sus PX llegan cuando el acto ya se ha resuelto.

## Descansos

Efecto de diálogo genérico `{ "type": "rest", "kind": "short" | "long" }` → `Ruleset.onRest` (5e en `rulesets/dnd5e/rest.ts`):
- **Descanso corto:** gasta dados de golpe (1dDG + CON cada uno) hasta tener más o menos el 75 % de los PG, recarga lo que se recupera con descanso corto (Tomar aliento, Oleada de acción, Canalizar divinidad) y aplica la Recuperación arcana del mago una vez por descanso largo.
- **Descanso largo:** PG al máximo, todos los recursos, la mitad de los dados de golpe y fuera los estados.
- **En los dos,** quien está caído pero vivo se levanta.

| Dónde | Tipo | Cuándo se ofrece (disparador de `triggers.json` y diálogo en el fuego) |
|---|---|---|
| `calles`: cocina de las viudas (`descanso_calles`) | Corto | Tras el combate del callejón (`callejon_despejado`) |
| `tunel`: hoguera de los Callados (`descanso_tunel`) | Corto | Tras el combate del túnel (`tunel_despejado`) |
| `abadia`: fogón de la cocina (`descanso_abadia`) | Largo | Tras D1 (`d1_resuelto`) |
| `mina`: brasas junto a la bajada (`descanso_mina`) | Largo | Tras D2 (`d2_resuelta`), antes de la Bóveda |
| `boveda`: tras caer Brea (`descanso_boveda`) | Corto | Tras el jefe (`brea_derrotado`) y antes de la collera; así se llega entero al posible duelo con Dorotea (D4, quemar) |

Cada descanso se puede tomar **una vez por partida** (marca `descanso_*`). El disparador vuelve a ofrecerlo en cada visita mientras no se haya tomado, y también se puede usar el fuego directamente. Todo descanso emite el evento de motor `{ type: 'rested', kind }` después de aplicarse, en el mismo comando: el cliente guarda ahí el punto de control (si el grupo cae, se vuelve a la última hoguera).

## Equilibrio

**Simulación encadenada** (`tests/playthrough/routes.ts`, el conductor automático con la IA a ambos lados):
- con `QA_DEEP=1`, **las 144 combinaciones de D1-D4 llegan al final sin aniquilación y ganando al jefe** con la configuración actual (incluidas las dos con `quemar` que fallaban en el duelo final contra Dorotea);
- con 6 semillas por ruta de humo, 0 aniquilaciones en 3 de las 4 rutas y 1 de 6 en la otra (`unirse/echar`, el grupo de tres sin Garrán).

**Endurecido respecto a la versión anterior:**
- los Callados pálidos son `ghast` (garras que paralizan y hedor);
- el jefe de los Sinpaga es `bandit_captain`;
- Brea es `foreman` (agente del bestiario: Bomba de pólvora y Rugido);
- los Callados de la Bóveda van con Brea, y dos más salen de la sima a mitad del combate.

**Ajustado para que el recorrido encadenado no aniquile al grupo:**
- Ivo es un Callado más (`zombie`);
- el callejón tiene un matón y tres bandidos.

**Probado y descartado:**
- Callados comunes como `ghoul`: con la IA hay aniquilaciones en la mina en 1 de cada 6 semillas.
- Callados comunes como `ghast` y pálidos como `wight`: aniquilación en la mina en la mitad de las rutas.

Con un jugador humano, que cura a los caídos y usa los barriles, la mina con `ghoul` sería razonable. Queda para la prueba en el móvil.

**Combates por separado** (`scratchpad/mapas/sim.ts`, 24 semillas, el grupo descansado):
- Sinpaga a nivel 4: 92 % de victorias y 2,4 caídas;
- Sinpaga a nivel 3: 79 % y 3,5 caídas;
- el resto, como en la tabla anterior.

**Correcciones de recorrido encontradas al simular:**
- el combate del callejón ocupa todo el callejón, así que no se puede saltar;
- la escena del Callado del pozo exige antes haber resuelto lo de los Sinpaga (`escorial_libre`), porque si no se peleaba con los Sinpaga al mismo tiempo;
- las combinaciones con `quemar` que fallaban en el combate final contra Dorotea: el grupo llegaba a ese duelo sin recuperarse del jefe, y el conductor da la partida por perdida en cuanto cae el protagonista. Ahora hay un descanso corto en la Bóveda tras el jefe.
