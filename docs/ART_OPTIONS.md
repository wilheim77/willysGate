# Catálogo de arte

Opciones de assets para *Intereses* y los dos juegos siguientes (*Willy el mazmorrero* y el de cazadores de vampiros). Solo se usan licencias que permitan modificar el arte, porque recoloreamos, añadimos animaciones por código y aplicamos filtros. **Nunca packs con NoDerivatives.**

| Pack | Precio | Licencia | Qué permite modificar | Tamaño | Qué trae | Encaje |
|---|---|---|---|---|---|---|
| [0x72 DungeonTileset II](https://0x72.itch.io/dungeontileset-ii) | Gratis | CC0 1.0 | Todo, sin atribución obligatoria | 16×16 | Tileset de mazmorra, unos 30 personajes y enemigos con idle y run (alguno con hit), armas como sprites sueltos, cofres, pociones, trampas | **Base principal de *Intereses*** (mina, abadía, criptas). Vale también para *Willy*. |
| [LPC / Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) | Gratis | CC-BY-SA 3.0 / GPL 3.0 (y OGA-BY o CC0 según la capa) | Todo, pero **hay que atribuir y publicar lo derivado con la misma licencia** | 64×64 por frame (cuerpo de ~48 px) sobre tiles de 32×32 | Personajes por capas, muy personalizables: walk, slash, thrust, spellcast, shoot, hurt, idle… en 4 direcciones. Tile atlas propio, alegre. | Creación de personaje si 0x72 se queda corto. **No casa con 0x72**: tiene el triple de resolución. |
| [Tiny Swords (Pixel Frog)](https://pixelfrog-assets.itch.io/tiny-swords) | Gratis | Licencia propia: uso comercial y modificación permitidos | Todo, salvo revender los assets | 64×64 | Muy bonito y colorido. Unidades humanas con ataque, solo vista lateral. | *Willy*. Demasiado alegre para el grimdark. |
| [Ninja Adventure (pixel-boy)](https://pixel-boy.itch.io/ninja-adventure-asset-pack) | Gratis | CC0 1.0 | Todo | 16×16 | Enorme: exteriores, interiores, cientos de personajes y monstruos, efectos, música y sonido. Simpático. | *Willy*. Posible fuente de exteriores a 16 px para el pueblo de *Intereses*, con filtro de color. |
| [Kenney](https://kenney.nl/assets) | Gratis | CC0 1.0 | Todo | Varios | Packs genéricos de todo tipo | Placeholders |
| Tiny Swords Enemy Pack (Pixel Frog) | ~15 $ | Licencia del autor (como Tiny Swords) | Modificación permitida | 64×64 | 16 enemigos con idle, run y attack | *Willy* |
| Modern Interiors / Modern Exteriors (LimeZu) | De pago | Licencia del autor: uso comercial permitido con condiciones; revisar antes de comprar | Edición permitida, no redistribuir los originales | 16×16 (y 32 y 48) | Escenarios modernos enormes | *Willy* |
| Hell – 16x16 Top-Down (Raguzar) | ~7-9 $ | Licencia del autor; la página dice que es editable | Edición permitida | 16×16 | Muy oscuro: personajes con attack y death en 4 direcciones, luces y niebla. **El autor declara que el arte está asistido por IA.** | Vampiros. Posible complemento oscuro de *Intereses*. |

## Prueba comparativa (2026-10-17)

En el mismo mapa (`content/intereses/maps/test.json`), con oscuridad, antorchas y la linterna del protagonista:

- `?arte=0x72`: https://wilheim77.github.io/willysGate/intereses/?arte=0x72 (preset por defecto)
- `?arte=lpc`: https://wilheim77.github.io/willysGate/intereses/?arte=lpc

**0x72:**
- **A favor:**
  - Ya es oscuro y coherente.
  - La iluminación le sienta muy bien: el pixel grande deja que la luz haga el trabajo.
  - Tiene muchos enemigos y es CC0, así que se puede modificar sin condiciones.
- **En contra:**
  - Personajes pequeños (16×28), con solo idle y run en 2 direcciones. El ataque, el golpe y la muerte habrá que hacerlos por código (está previsto).
  - **Solo trae mazmorra.** Para el pueblo y los exteriores de Hondonegra hace falta otro pack de 16 px: Ninja Adventure (CC0) con filtro de color, o Raguzar.
  - Los protagonistas «caballero, elfo, enano, mago» son genéricos. Los compañeros con aspecto propio (Dorotea, Garrán, Anselmo) necesitarán recolores o retoques.

**LPC:**
- **A favor:**
  - Personajes con mucha personalidad y todas las animaciones de combate, ideal para compañeros y para la creación de personaje.
- **En contra:**
  - Los tiles LPC son brillantes y genéricos: incluso con el filtro, quedan más «aventura» que grimdark.
  - Mezclar personajes LPC con tiles 0x72 no funciona por escala.

**Recomendación:** 0x72 como base de *Intereses*, con animaciones por código e iluminación como principal fuente de ambiente. Queda pendiente elegir el pack de exteriores a 16 px para el pueblo. LPC se queda en el pipeline como opción para la creación de personaje o para otro juego.

## Cómo entra un pack en el proyecto

1. Las fuentes originales van en `art-src/<pack>/`, con un `SOURCE.md` (origen, autor, licencia y fecha).
2. La especificación por juego y preset va en `content/<juego>/art/<preset>/`:
   - `tiles.json`: terrenos (variantes de suelo y textura de cara o acantilado);
   - `characters.json`: personajes LPC por capas;
   - `sprites.json`: sprites animados ya empaquetados en un atlas, como 0x72.
3. `npm run art` genera `public/assets/<preset>/` y el manifiesto `content/<juego>/assets/<preset>.json`.
4. Créditos en `CREDITS.md`. Si la licencia lo exige (BY-SA), las modificaciones se documentan y se publican con la misma licencia.
