# Créditos

## Reglas

Este trabajo incluye material tomado del System Reference Document 5.1 ("SRD 5.1") de Wizards of the Coast LLC, disponible en https://dnd.wizards.com/resources/systems-reference-document. El SRD 5.1 se publica bajo la licencia Creative Commons Attribution 4.0 International, disponible en https://creativecommons.org/licenses/by/4.0/legalcode.

Se usa en `rulesets/dnd5e/`.

## Software

| Componente | Autor | Licencia | URL |
|---|---|---|---|
| Phaser 3 | Phaser Studio Inc. | MIT | https://phaser.io |

## Tipografías

| Fuente | Autor | Licencia | URL | Uso |
|---|---|---|---|---|
| VT323 | Peter Hull | SIL Open Font License 1.1 | https://fonts.google.com/specimen/VT323 | Interfaz de *Intereses* |

## Arte y sonido

Las fuentes originales están en `art-src/<pack>/`, cada una con su `SOURCE.md`. El arte de cada juego se genera con `npm run art` (ver `docs/DESIGN.md` → Arte). Catálogo y licencias de los packs candidatos en `docs/ART_OPTIONS.md`.

| Asset | Juego / preset | Autor | Licencia | URL | Uso y modificaciones |
|---|---|---|---|---|---|
| 0x72 DungeonTileset II v1.7 | intereses / `0x72` | Robert (0x72) | CC0 1.0 | https://0x72.itch.io/dungeontileset-ii | Suelos, muros y personajes (caballero, orco, esqueleto). Recortados en un atlas de terreno; el atlas original se usa tal cual. |
| Universal LPC Spritesheet Character Generator (capas de personaje) | intereses / `lpc` | Varios: Stephen Challener (Redshrike), Johannes Sjölund (wulax), Matthew Krohn (makrohn), bluecarrot16, Benjamin K. Smith (BenCreating), Eliza Wyatt (ElizaWy), JaidynReiman, Evert, TheraHedwig, MuffinElZangano, Durrani, Manuel Riecke (MrBeast), Nila122. Detalle por capa en `content/intereses/public/assets/lpc/characters/CREDITS-characters.csv`. | CC-BY-SA 3.0 / GPL 3.0 (algunas capas también OGA-BY 3.0 o GPL 2.0) | https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator (commit `9bf06be`) | Capas combinadas y recoloreadas por paleta en una hoja por personaje. **La hoja derivada se publica como CC-BY-SA 3.0.** |
| LPC Tile Atlas | intereses / `lpc` | Varios artistas del Liberated Pixel Cup (lista completa en `art-src/lpc-tile-atlas/Attribution.txt`) | CC-BY-SA 3.0 / GPL 3.0 | https://opengameart.org/content/lpc-tile-atlas | Tiles de terreno recortados en un atlas. **El atlas derivado se publica como CC-BY-SA 3.0.** |

**Modificaciones en tiempo de ejecución:** todos los presets pasan por un filtro de color de cámara (saturación, brillo, tinte) y una capa de iluminación. No se modifican los ficheros.

**Licencia del arte derivado:** lo generado a partir de LPC (`content/*/public/assets/lpc/`) se distribuye bajo **CC-BY-SA 3.0** con la atribución anterior. El arte CC0 se puede usar sin condiciones. El código del proyecto es MIT (`LICENSE`).
