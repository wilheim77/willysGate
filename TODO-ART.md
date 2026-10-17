# Arte pendiente

Preset por defecto: **0x72** (ver `docs/ART_OPTIONS.md`). Catálogo de ids y peticiones al render: `docs/ART_CATALOG.md`. Lo marcado como *placeholder* se dibuja por código o con un tile provisional.

## Pendiente

| Pendiente | Juego | Situación actual | Qué hace falta |
|---|---|---|---|
| Exteriores del pueblo (Hondonegra, el Escorial) | intereses | **Elegido Ninja Adventure (CC0).** Ya se usa para la tierra; las caras de acantilado ahora son recolores. | Elegir casas, vallas, árboles muertos y escombreras del pack (`TilesetHouse`, `TilesetVillageAbandoned`, `TilesetNature`) cuando se monten los mapas del acto (Fase 5) |
| Llamas de antorcha en el juego | intereses | **Arte hecho** (`torch_wall`, `brazier`); el render aún usa la llama por código de `src/fx/LightingLayer.ts` | Petición al render n.º 1 en `docs/ART_CATALOG.md` |
| Reborde de plataformas | intereses | Horneado en las caras (`*_face` con reborde) y `rim_*` sueltos | Petición al render n.º 4 para dibujarlo una sola vez |
| Sangre, chispas y polvo como sprites | intereses | **Arte hecho** (`blood_1..3`, `fx_hit_spark`, `fx_dust`); `juice.ts` usa cuadrados por código | Peticiones al render n.º 2 y 3 |
| Animaciones de ataque, golpe y muerte (0x72) | intereses | No existen en el pack | Por código (`src/fx/`) |
| Terreno `scaffold` en los mapas | intereses | Arte y manifiesto listos | Tile lógico en `content/intereses/maps/terrain-logic.png` (sesión principal) |
| Reproductor de cinemáticas | intereses, willy | **Viñetas y `intro.json` hechos** (guion de *Intereses* aprobado) | Fase 6: reproductor (ver `docs/ART_CATALOG.md`); aprobar `docs/willy/INTRO.md` |
| Superficies, barriles y explosión en el juego | intereses | **Arte hecho** (`surfaces`, `barrel`, `barrel_oil`, `crate`, `fx_explosion`, `fx_steam`) | Peticiones al render n.º 8 a 10 en `docs/ART_CATALOG.md`; bordes por vecinos (n.º 11) solo si hacen falta |
| *Willy*: resto del encargo P1 | willy | Hecho: Willy en 9 clases y los PNJ del Camerino | Enemigos de la Planta 1, tiles de Castro Sumergido y del Camerino, cajas de botín y marcos de carta |
| *Willy*: P2 y P3 | willy | — | Invocaciones, utilería del plató, superficies, efectos, HUD del concurso; rivales modulares (cuerpo por raza + paletas + accesorios), el Presentador y los biomas 2-5 |
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
| Entorno táctico (Fase 3) | intereses | Superficies `oil`, `grease`, `fire`, `water`, `ice`, `electrified`, `blood`, `rubble`; objetos `barrel`, `barrel_oil`, `crate` con restos; `fx_explosion` y `fx_steam` (`environment-art.ts`) |
| Lectura de personajes y retratos | intereses | Color y detalle propio por personaje (decals); retratos de 32×32 para el HUD (`build-portraits.ts`) |
| Garrán dibujado a mano | intereses | 16×28 con idle, carrera y golpe (`hand-sprites.json`) |
| Retratos del grupo a 48×48 | intereses | Cobrador, Garrán, Dorotea y Anselmo pintados con cara propia (`portrait-painter.ts`) |
| Pulido del HUD | intereses | Barra superior en una fila, fichas de iniciativa con retrato, barra de acciones en dos filas, botones de 44 px, paneles de hierro biselado |
