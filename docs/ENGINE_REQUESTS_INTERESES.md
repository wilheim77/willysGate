# Peticiones de los mapas de *Intereses* a la sesión principal

> Las escribe el agente de mapas (rama `mapas`). Los mapas ya llevan los datos; falta que el motor, el cliente o `content/intereses/game.ts` los lean. Ver [`MAPS.md`](MAPS.md) para las convenciones.

| # | Qué | Capa | Bloquea |
|---|---|---|---|
| I1 | Capa `scenes`: zonas que abren un diálogo al entrar el líder | cliente (como `encounters`) | prólogo, juicio, emboscadas habladas |
| I2 | Capa `exits` + R10 `changeMap` | motor + cliente | pasar de un mapa a otro |
| I3 | `game.ts`: cargar todos los mapas y crear entidades por nombre de spawn | contenido | todo |
| I4 | Encuentros condicionados por marcas (`requiresFlag`, `unlessFlag`) | cliente | rutas de D1, emboscada de la Galería Sellada |
| I5 | Derrumbe por zona (`collapse`) | motor (efecto) + guion | la Bóveda (polvorín de Brea) |

## I1. Capa `scenes`

Zonas rectangulares con propiedades:
- `dialogue` (string): id del diálogo. Mientras el guion no exista vale `TODO:<id propuesto>`.
- `speaker` (string): id de la entidad que habla (un spawn del mismo mapa).
- `once` (bool): solo la primera vez.
- `fight` (string, opcional): ids separados por comas, para el efecto `startCombat` del diálogo si acaba a golpes.

Cuando el líder entra (fuera de combate), se abre el diálogo de `speaker`. Es lo mismo que hoy hace `checkEncounters` con `encounters`, pero con `startDialogue`. Sirve para los combates que se pueden evitar hablando (mineros hambrientos, fanáticos de la Santa Pala): **no llevan zona `encounters`**, porque `checkEncounters` empezaría el combate sin mirar si alguien es hostil.

## I2. Capa `exits`

Zonas con `to` (id de mapa) y `spawn` (nombre de un spawn `entry-*` del mapa de destino). Al pisarlas el líder fuera de combate: `changeMap` (R10 de `docs/willy/ENGINE_REQUESTS.md`) con el grupo, el líder en `spawn` y los compañeros en las casillas libres más cercanas. Propiedad opcional `requiresFlag` (p. ej. la cripta de la abadía solo se abre con la llave del barón). El test `tests/content/maps.test.ts` ya comprueba que cada salida apunta a un mapa y un spawn que existen.

## I3. Entidades desde los spawns

Convención de nombres (ver `MAPS.md`):
- `hero`, `dorotea`, `garran`, `anselmo`: el grupo (solo en el mapa de inicio; en los demás el grupo llega por `entry-*`). `anselmo` en la plaza es el reo, todavía no del grupo.
- `<id del reparto>`: un PNJ con nombre (`nella`, `odda`, `cirilo`, `mazo`, `hilda`, `lisandro`, `absalon`, `ivo`...). Cuando exista `content/intereses/cast.json` (rama `guion`), los nombres coinciden con sus ids.
- `<plantilla>-<n>`: criaturas genéricas (`minero_hambriento-1`, `fanatico_pala-2`, `guardia_baron-1`, `sinpaga-3`, `callado-4`...). Hace falta una tabla plantilla → `monsterId`, `spriteId`, facción y nombre.
- `barrel_oil-n`, `barrel-n`, `crate-n`: ya funcionan.
- `chest-<id>`, `lever-<id>`, `door-<id>`: interactuables (`createProp` con `dialogue:<id>`). Un `door-*` va sobre una casilla `door_closed`; el test la cuenta como transitable porque se puede abrir.
- `todo-<algo>`: marcador de algo que falta definir; no crea nada.
- `entry-<origen>`: llegada desde otro mapa.

## I4. Encuentros condicionados

Propiedades opcionales en `encounters`: `requiresFlag` y `unlessFlag`. Ejemplos: la guardia de la abadía solo pelea en la noche de las antorchas si te unes a la Cuadrilla; los Callados de la ruta de la cripta solo aparecen si entras por ahí.

## I5. Derrumbe

Capa `collapse` en la Bóveda: zonas con `height` (nueva altura) y `terrain`. Un efecto genérico `setTiles { tiles, terrain?, height?, walkable? }` (o `setTile` sobre una zona) que el guion del jefe dispare a mitad de combate (STORY §6: Brea vuela un polvorín). Quien esté encima cae (`onFall`) con la diferencia de altura.

---

# Peticiones del guion (rama `guion`)

El guionista no toca `engine/`, `rulesets/` ni `src/`. Aquí se apunta lo que haría falta y cómo se ha resuelto mientras tanto.

| # | Qué | Estado |
|---|---|---|
| G1 | `next` condicional en nodos sin opciones | **Hecho**. Se usa en el juicio (descripción de la plaza solo la primera vez, la réplica de Garrán) y en la audiencia (Anselmo y Garrán) |
| G2 | `onVictory` / `onDefeat` en `startCombat` | **Hecho**. Los mineros del camino ponen `prologo_mineros_resuelto` al perder |
| G3 | Condición `inParty` | **Hecho**. Sustituye a `garran_reclutado` en todas las réplicas de Garrán. Las marcas `*_reclutado` se quedan como historia |

## Pendiente para los mapas y los guiones de escena

**Spawns con nombre.** Calles: `viuda-1` → `benita` y `viuda-2` → `casilda`. Plaza: `guardia_baron-1` → `guardia_abadia`. Falta `posadera` (Remedios) en El Pico Roto.

**Interactuables:**
- `pozo_ahorcado` es un objeto en el Escorial, junto a `entry-pozo`. No es cofre, puerta ni palanca, así que necesita un spawn propio.
- `inscripcion_boveda` va en el spawn `todo-inscripcion` de la Bóveda.
- `door_bocamina` y `door_cripta` ya siguen la convención.

**Escenas** (zona → diálogo, hablante):

| Mapa | Zona | Diálogo | Hablante | Condición |
|---|---|---|---|---|
| camino | `garran-en-la-cuneta` | `camino_garran` | `garran` | — |
| escorial | `sinpaga-jefe` | `sinpaga_jefe` | `sinpaga_enmascarado-1` | — |
| escorial | junto a `callado-1` | `callado_pozo` | `callado-1` | — |
| plaza | noche de las antorchas | `noche_antorchas` | `nella` | `acceso_contrabando` y no `d1_resuelto` |
| plaza | tras el asalto | `d1_horca` | `nella` | `d1_cuadrilla` (después del combate de la abadía) |
| abadia | tras la defensa | `d1_abadia_final` | `mazo` | `d1_abadia` (después del combate) |
| mina | `galeria-sellada` | `galeria_sellada` | `garran` | — |
| boveda | `brea-habla` | `boveda_brea` | `absalon` | — |

**Los abre el juego** (no hay zona):
- `boveda_collera` cuando se pone `brea_derrotado` (lo pone el `onVictory` de la Bóveda).
- `el_cobro` al llegar a la plaza con `d3_resuelta`. D3 acaba con `travel` a `plaza`/`entry-escorial`.
- `epilogo` cuando se pone `d4_resuelta` y no hay combate.

**Marcas que piden los mapas:**

| Marca provisional | Marca real |
|---|---|
| `TODO:noche_antorchas_resuelta` | `d1_resuelto` |
| `TODO:llave_cripta` | `llave_cripta` (también está el objeto del mismo nombre) |
| `TODO:d2_resuelta` | `d2_resuelta` |

**Encuentros de D1:**
- Guardia de la abadía si `d1_cuadrilla`.
- Cuadrilla, con Odda, si `d1_abadia`.
- Los Hulla no pelean si `hulla_no_luchan`.

**Mecánica que queda al juego o al ruleset:**
- `brea_vuela_polvorin`: el derrumbe a mitad del combate del jefe.
- `garran_sin_nada_que_perder`: ventaja de Garrán en la Bóveda.
- `d3_puesta`: desventaja en Sabiduría y curas de Anselmo a la mitad. La collera da una orden por combate.
- `pueblo_hostil`: precios de la posada y la Santa Pala no cura.
- `d2_expulsado`: Garrán aparece herido y neutral en la Bóveda.
- Subidas de nivel. A 4 con `pista_plata_nueva` + `pista_pozo`, a 5 con `d1_resuelto` y a 6 con `d2_resuelta`.

**Fanáticos del juicio:** el combate se empieza por facción (`fanaticos`).
