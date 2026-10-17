# Peticiones de los mapas de *Intereses* a la sesión principal

> Las escribe el agente de mapas (rama `mapas`). Convenciones en [`MAPS.md`](MAPS.md).

| # | Qué | Capa | Estado |
|---|---|---|---|
| I1 | Capa `scenes`: zonas que abren un diálogo al entrar el líder | cliente | **hecho** (sesión principal) |
| I2 | Capa `exits` + R10 `changeMap` | motor + cliente | **hecho** |
| I3 | Entidades a partir de los nombres de spawn | contenido (`world.ts`) | **hecho** |
| I4 | Encuentros y escenas condicionados por marcas (`requiresFlag`, `unlessFlag`) | cliente | **hecho** |
| I5 | Derrumbe por zona (`collapse`) | motor (`setTiles`) + guion | efecto hecho; falta el guion del jefe que lo dispare |
| I6 | Resonadores de plata viva: un tipo de prop destructible | ruleset/contenido | pendiente |
| I7 | Polea de la Bóveda (`lever-polea`): soltar la cuba sobre la zanja | guion | pendiente |
| I8 | Marcas que aún faltan en `flags.json` | guion | pendiente |

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
- `hero`, `dorotea`, `garran`: el grupo, solo en el mapa inicial (`camino`, con la propiedad `start`). En los demás mapas el grupo llega por `entry-*`.
- **Id de `cast.json`:** un PNJ con nombre (`garran`, `minero_cabecilla`, `anselmo`, `cirilo`, `fanatico_1`, `nella`, `odda`, `mazo`, `hilda`, `guardia_abadia`...). Faltan en el reparto, y los mapas ya los usan: `lisandro`, `absalon` e `ivo`.
- **`<plantilla>-<n>`:** criaturas genéricas de `templates.json`. Los mapas usan `minero_cuadrilla`, `guardia_baron`, `guardia_baron_sargento`, `fiel_pala`, `viuda`, `sinpaga_enmascarado`, `sinpaga_cuchillero`, `sinpaga_bruto`, `callado` y `callado_palido`.
- **Props:** `barrel_oil`, `barrel`, `crate`, `oil_cart`, `well`, `campfire`, `gallows`, `tapestry`, `tapestry_crossbow`, `mine_wagon`, `mine_wagon_ore`, `powder_keg` (debería explotar como `barrel_oil`), `resonator` (I6), `fuse_charges`, `remains_forty`, `pulley` e `inscription`. El test los trata todos como obstáculos, salvo las palancas y las puertas.
- **`chest-<x>`, `lever-<x>`, `door-<x>`:** interactuables con el diálogo `<kind>_<x>`. Hoy: `chest_libro_cuentas`, `door_trastienda`, `door_patio_lisandro`, `door_cripta`, `door_bocamina` y `lever_polea`. Un `door-*` va sobre una casilla `door_closed`; el test la cuenta como transitable porque se puede abrir.
- `todo-<algo>`: marcador de algo que falta definir; no crea nada.
- `entry-<origen>`: llegada desde otro mapa.

## I4. Encuentros condicionados

Propiedades opcionales en `encounters`: `requiresFlag` y `unlessFlag`. Ejemplos: la guardia de la abadía solo pelea en la noche de las antorchas si te unes a la Cuadrilla; los Callados de la ruta de la cripta solo aparecen si entras por ahí.

## I5. Derrumbe

Capa `collapse` en la Bóveda: zonas con `height` (nueva altura) y `terrain`. Un efecto genérico `setTiles { tiles, terrain?, height?, walkable? }` (o `setTile` sobre una zona) que el guion del jefe dispare a mitad de combate (STORY §6: Brea vuela un polvorín). Quien esté encima cae (`onFall`) con la diferencia de altura.

## I6. Resonadores

`resonator-1..4` en la Bóveda (el arte ya existe). Son objetos destructibles (como un barril, con más puntos de golpe). Mientras quede alguno en pie, al empezar cada ronda los que lo oyen hacen una salvación de Sabiduría; quien falla queda *embelesado* y pierde la reacción (STORY §6). La regla va en el ruleset.

## I7. Polea

`lever-polea` en el balcón de Brea: al usarla, la cuba de mineral cae en la zanja (h1) que hay bajo el balcón (daño en un área de 3×1, escombros). Es un diálogo de objeto con `applyElement`/`spawnSurface`; es trabajo del guion.

## I8. Marcas pendientes

Los mapas usan marcas que todavía no están en `flags.json`, escritas como `TODO:<nombre propuesto>`:
- `TODO:llave_cripta` (salida de la cripta de la abadía a la mina; D1, defender);
- `TODO:d2_resuelta` (emboscada de la Galería Sellada);
- `TODO:brea_vuela_polvorin` (disparo del derrumbe; los barriles `powder_keg-1..3` del polvorín).

Diálogos aún sin escribir: `TODO:sermon_cirilo`, `TODO:galeria_sellada` y `TODO:boveda_brea`.

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
