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

## G1. Saltos condicionales entre nodos

**Qué:** que un nodo pueda continuar a un sitio distinto según una condición, sin que el jugador elija nada. Por ejemplo, `next` como lista `[{ "when": {...}, "next": "a" }, { "next": "b" }]`, o un `when` en el propio nodo para saltárselo.

**Para qué:** hay frases que solo tienen sentido si alguien está en el grupo (Garrán en la audiencia o en el camino), o que cambian con decisiones anteriores. El epílogo, con viñetas que dependen de D1–D4, lo necesita de verdad.

**Mientras tanto:**
- Se duplican las opciones con `when` contrarios (por ejemplo, Intimidación con o sin Garrán) y cada una lleva a su propia variante del nodo.
- Se ordenan las escenas para que la condición se cumpla siempre. La abadía solo abre tras el juicio, así que Anselmo siempre está en la audiencia.
- En las escenas narradas, el jugador elige la variante en una opción condicionada («[Garrán] …»), y siempre queda una salida sin condición.

## G2. Ganchos al terminar un combate iniciado desde un diálogo

**Qué:** un `onVictory` / `onDefeat` (efectos o un diálogo) en `startCombat`.

**Para qué:** al ganar contra los mineros del camino hay que poner `prologo_mineros_resuelto`. Lo mismo pasa con los fanáticos y, más adelante, con los Sinpaga y los Callados.

**Mientras tanto:** las marcas que dependen del resultado llevan `setBy` en `flags.json` y las pone el script de la escena.

## G3. Comprobar si una entidad está en el grupo

**Qué:** una condición `{ "inParty": "garran" }` (genérica: controlador y facción del jugador).

**Mientras tanto:** se usan las marcas `garran_reclutado` y `anselmo_reclutado`. Si un compañero se va (D2, D4), el diálogo que lo eche tiene que borrar su marca.
