# Arte pendiente

Preset por defecto: **0x72** (ver `docs/ART_OPTIONS.md`). Catálogo de ids y peticiones al render: `docs/ART_CATALOG.md`. Lo marcado como *placeholder* se dibuja por código o con un tile provisional.

## Pendiente

| Pendiente | Juego | Situación actual | Qué hace falta |
|---|---|---|---|
| Exteriores del pueblo (Hondonegra, el Escorial) | intereses | **Elegido Ninja Adventure (CC0).** Ya se usa para la tierra; las caras de acantilado ahora son recolores. | Elegir casas, vallas, árboles muertos y escombreras del pack (`TilesetHouse`, `TilesetVillageAbandoned`, `TilesetNature`) cuando se monten los mapas del acto (Fase 5) |
| Llamas de antorcha en el juego | intereses | **Arte hecho** (`torch_wall`, `brazier`); el render aún usa la llama por código de `src/fx/LightingLayer.ts` | Petición al render n.º 1 en `docs/ART_CATALOG.md` |
| Reborde de plataformas | intereses | Horneado en las caras (`*_face` con reborde) y `rim_*` sueltos | Petición al render n.º 4 para dibujarlo una sola vez |
| Sangre, chispas y polvo como sprites | intereses | **Arte hecho** (`blood_1..3`, `fx_hit_spark`, `fx_dust`); `juice.ts` usa cuadrados por código | Peticiones al render n.º 2 y 3 |
| Garrán más grande | intereses | Recolor de `orc_warrior`, algo más bajo que los humanos | Escala por sprite (petición n.º 5) o retoque a mano a 16×28 |
| Animaciones de ataque, golpe y muerte (0x72) | intereses | No existen en el pack | Por código (`src/fx/`) |
| Terreno `scaffold` en los mapas | intereses | Arte y manifiesto listos | Tile lógico en `content/intereses/maps/terrain-logic.png` (sesión principal) |
| Reproductor de cinemáticas | intereses, willy | **Viñetas y `intro.json` hechos** (borradores de guion) | Fase 6: reproductor (ver `docs/ART_CATALOG.md`); aprobar `docs/intros/INTERESES.md` y `docs/willy/INTRO.md` |
| Willy en el juego | willy | Solo existe el sprite ASCII de las viñetas | Sprite jugable cuando se decida el pack de *Willy* |
| Tileset lógico de Tiled | intereses | `content/intereses/maps/terrain-logic.png` | Solo lo usa el editor. Se queda así. |

## Hecho

| Pieza | Juego | Cómo |
|---|---|---|
| Tablones y andamios de la mina | intereses | `planks` (3 variantes + cara de vigas) y terreno nuevo `scaffold`, dibujados por `build-extra-art.ts` |
| Remate de muro macizo | intereses | `wall_top_1..2` sin píxeles transparentes |
| Caras de tierra y escoria | intereses | Acantilados de Ninja Adventure recoloreados a la paleta de 0x72 |
| Compañeros con aspecto propio | intereses | `cobrador`, `dorotea`, `garran`, `anselmo` (pipeline de paletas) |
| Enemigos con variantes | intereses | Sinpaga (3), guardia del barón (2), Callados (2), minero de la Cuadrilla, Absalón, esqueleto minero, ahogado |
| Viñetas del prólogo | intereses, willy | `build-cinematics.ts`; 10 viñetas para *Intereses*, 16 para *Willy* |
