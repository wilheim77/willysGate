# Arte pendiente (placeholders)

| Placeholder | Juego | Dónde | Qué hace falta |
|---|---|---|---|
| Tileset isométrico (piedra, tierra, escoria, muro, tablones) | intereses | `content/intereses/public/assets/placeholder/tiles.png`, generado por `scripts/gen-placeholder-tileset.mjs` | Pack isométrico de fantasía oscura, CC0 o CC-BY, de 64×32 o similar |
| Laterales de los bloques elevados | intereses | Se dibujan en `MapScene` con los colores `side` del manifiesto | Tiles de bloque o pared con su lateral pintado |
| Personaje «hero» (figura encapuchada) | intereses | Se dibuja en tiempo de ejecución (`kind: "placeholder"` en el manifiesto) | Spritesheet isométrico con 4 u 8 direcciones y animaciones de andar y quieto |

## Candidatos (propuestos el 2026-10-16, pendientes de elegir)

| Opción | Packs | Licencia | Encaje |
|---|---|---|---|
| **A (recomendada)** | [Isometric Stone Soup](https://opengameart.org/content/isometric-stone-soup) (suelos y muros, 64×32, compatible con Tiled) + [Dungeon Crawl 32x32 tiles](https://opengameart.org/content/dungeon-crawl-32x32-tiles) (personajes, monstruos, objetos, efectos e iconos) | CC0 las dos | Mismo origen (DCSS), así que el estilo es coherente. El tamaño de tile coincide con el actual. Los personajes miran de frente: no tienen 8 direcciones ni animación de andar. |
| B | Isometric Stone Soup + [8 Directional Knight](https://hormelz.itch.io/8-directional-knight) y similares de Hormelz | CC0 | Animaciones completas en 8 direcciones, pero con otro estilo (HD-2D) y solo caballeros. |
| C | [Kenney Isometric Miniature Dungeon](https://opengameart.org/content/isometric-miniature-dungeon) + [Dark Fantasy Isometric Tiles](https://opengameart.org/content/dark-fantasy-isometric-tiles) | CC0 / CC-BY 4.0 | Render 3D, no pixel art. Choca con la estética retro. |

Descartado: el arte de Flare, por ser CC-BY-SA (fuera de CC0/CC-BY).
