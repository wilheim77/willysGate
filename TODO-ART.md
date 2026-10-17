# Arte pendiente

Preset por defecto: **0x72** (ver `docs/ART_OPTIONS.md`). Lo marcado como *placeholder* se dibuja por código o con un tile provisional.

| Pendiente | Juego | Situación actual | Qué hace falta |
|---|---|---|---|
| Exteriores del pueblo (Hondonegra, el Escorial) | intereses | **Elegido Ninja Adventure (CC0).** Ya se usa para la tierra y los acantilados. | Elegir casas, vallas, árboles muertos y escombreras del pack (`TilesetHouse`, `TilesetVillageAbandoned`, `TilesetNature`) cuando se monten los mapas del acto (Fase 5) |
| Tablones y andamios de la mina | intereses | `floor_ladder` de 0x72 | Ningún pack tiene madera a 16 px que encaje; buscarla o dibujarla |
| Plataformas elevadas | intereses | Cara `wall_mid` teñida; poco contraste en lo alto | Un tile de borde o reborde para la parte superior |
| Llamas de antorcha | intereses | Placeholder generado por código (`src/fx/LightingLayer.ts`) | Sprite animado de antorcha o brasero |
| Animaciones de ataque, golpe y muerte (0x72) | intereses | No existen en el pack | Por código en la Fase 2 (`src/fx/procedural.ts`) |
| Compañeros con aspecto propio (Dorotea, Garrán, Anselmo) | intereses | — | Recolores de sprites 0x72 (pipeline de paletas, Fase 2) o retoques a mano |
| Viñetas del prólogo cinemático | intereses | — | Fase 6 |
| Tileset lógico de Tiled | intereses | `content/intereses/maps/terrain-logic.png` | Solo lo usa el editor. Se queda así. |
