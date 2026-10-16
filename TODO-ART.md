# Arte pendiente

Preset por defecto: **0x72** (ver `docs/ART_OPTIONS.md`). Lo marcado como *placeholder* se dibuja por código o con un tile provisional.

| Pendiente | Juego | Situación actual | Qué hace falta |
|---|---|---|---|
| Exteriores del pueblo (Hondonegra, el Escorial) | intereses | 0x72 solo trae mazmorra | Un pack de exteriores a 16 px: Ninja Adventure (CC0) con filtro de color, o Raguzar «Hell» (de pago). Decisión del usuario. |
| Tierra, escoria y tablones | intereses | Variantes de suelo de mazmorra de 0x72 | Texturas propias a 16 px (del pack de exteriores) |
| Plataformas elevadas | intereses | Cara `wall_mid` teñida; poco contraste en lo alto | Un tile de borde o reborde para la parte superior |
| Llamas de antorcha | intereses | Placeholder generado por código (`src/fx/LightingLayer.ts`) | Sprite animado de antorcha o brasero |
| Animaciones de ataque, golpe y muerte (0x72) | intereses | No existen en el pack | Por código en la Fase 2 (`src/fx/procedural.ts`) |
| Compañeros con aspecto propio (Dorotea, Garrán, Anselmo) | intereses | — | Recolores de sprites 0x72 (pipeline de paletas, Fase 2) o retoques a mano |
| Viñetas del prólogo cinemático | intereses | — | Fase 6 |
| Tileset lógico de Tiled | intereses | `content/intereses/maps/terrain-logic.png` | Solo lo usa el editor. Se queda así. |
