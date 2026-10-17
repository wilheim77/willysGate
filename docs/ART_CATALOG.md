# Catálogo de arte del preset 0x72 (*Intereses*)

Qué ids puede usar el contenido, de dónde sale cada pieza y qué le falta al render para aprovecharlas. Todo se regenera con `npm run art`. Previsualizaciones en [`docs/art-previews/`](art-previews/).

## Pipelines

| Script | Entrada | Salida | Qué hace |
|---|---|---|---|
| `scripts/art/build-extra-art.ts intereses 0x72` | (código) | `art-src/generated/intereses-0x72-extra.png` + `.txt`, `public/assets/0x72/extra.png`, `props`, `surfaces` y los sprites `barrel`, `barrel_oil`, `crate` del manifiesto | Dibuja píxel a píxel, con la paleta de 0x72 (`pixel.ts`) y RNG con semilla: tablones, andamios, remate de muro, caras con reborde, rebordes sueltos, antorcha, brasero, FX, y (en `environment-art.ts`) superficies, barriles, explosión y vapor. Recolorea por luminancia las caras de acantilado de Ninja Adventure. |
| `scripts/art/build-tiles.ts intereses 0x72` | `content/intereses/art/0x72/tiles.json` | `public/assets/0x72/tiles/terrain.png`, `terrain` del manifiesto | Ahora admite celdas `{ "atlas": "<hoja>.png", "sprite": "nombre" }` (con lista `<hoja>.txt`) y un `rim` opcional por terreno. |
| `scripts/art/build-atlas-sprites.ts intereses 0x72` | `sprites.json` | `sprites` del manifiesto | Sin cambios: personajes 0x72 tal cual. |
| `scripts/art/build-palette-variants.ts intereses 0x72` | `content/intereses/art/0x72/palettes.json` | `public/assets/0x72/characters.png`, `sprites` del manifiesto | Recolorea personajes 0x72: `map` (color exacto → color, o `transparent`), `adjust` (HSV por rango de tono), `prune` (borra el contorno que queda huérfano), `rules` (solo píxeles interiores o una franja de filas: así se pinta el collar de plata de Absalón). `aliases` da el mismo arte a ids antiguos. Para ver los colores de una base: `node scripts/art/build-palette-variants.ts intereses 0x72 --dump doc elf_f`. |
| `scripts/art/build-previews.ts intereses 0x72` | manifiesto | `docs/art-previews/0x72-{characters,terrain,props,surfaces}.png` | Hojas de revisión. |
| `scripts/art/build-cinematics.ts <juego>` | `content/<juego>/cinematics/intro.spec.json` | `public/assets/cinematics/*.png`, `cinematics/intro.json`, `docs/art-previews/<juego>-intro.png` | Viñetas de 320×180 compuestas con operaciones (degradados con tramado, polígonos, tiles y sprites de los packs, sprites del manifiesto, sprites ASCII dibujados a mano, montañas, casas, lluvia, público, luces, viñeteado, texto pixelado). |

## Sprites (`spriteId`)

Todos son `kind: 'frames'`, miran a la derecha y tienen `idle` (4) y `move` (4); los que indican «hit» tienen además `hit` (1).

| Id | Base 0x72 | Tamaño | Qué es |
|---|---|---|---|
| `cobrador` | `doc` | 16×23 | Protagonista: cobrador encapuchado, capa parda, correa de latón y máscara de cuero |
| `dorotea` | `elf_f` | 16×28, hit | Dorotea Vane: pelo negro, vestido granate oscuro, lazo azul tinta |
| `garran` | `orc_warrior` | 16×23 | Garrán Tizón: semiorco, piel gris oliva, cinturón de cuero |
| `anselmo` | `dwarf_f` | 16×28, hit | Fray Anselmo: mediano con hábito pardo de capucha y cordón |
| `sinpaga_cuchillero` | `elf_m` | 16×28, hit | Bandido Sinpaga, jubón rojo sucio |
| `sinpaga_enmascarado` | `masked_orc` | 16×23 | Bandido Sinpaga con máscara de calavera |
| `sinpaga_bruto` | `ogre` | 32×36 | Bruto Sinpaga (élite grande) |
| `guardia_baron` | `knight_m` | 16×28, hit | Guardia del barón Mazo: acero mate, penacho granate |
| `guardia_baron_sargento` | `knight_f` | 16×28, hit | Sargento de la guardia: acero ennegrecido |
| `minero_cuadrilla` | `dwarf_m` | 16×28, hit | Minero enano de la Cuadrilla (clan Hulla) |
| `callado` | `dwarf_m` | 16×28, hit | Callado: piel cenicienta, barba plateada |
| `callado_palido` | `elf_m` | 16×28, hit | Callado joven: pálido, ojos sin color, harapos |
| `absalon` | `big_zombie` | 32×36 | Absalón Brea (jefe): calvo, curtido, collar de plata |
| `esqueleto_minero` | `skelet` | 16×16 | Esqueleto de la mina, hueso amarillento |
| `ahogado` | `ice_zombie` | 16×16 | Ahogado de las galerías inundadas |

**Ids provisionales del encuentro de prueba** (no se han borrado):

| Id actual | Qué arte tiene ahora | Sustituto recomendado en el contenido |
|---|---|---|
| `dorotea`, `garran`, `anselmo` | El recolor de esta tabla (ya no `elf_f`/`knight_m`/`dwarf_m` tal cual) | Mismo id |
| `bandit` | Alias de `sinpaga_cuchillero` | `sinpaga_cuchillero` |
| `thug` | Alias de `sinpaga_enmascarado` | `sinpaga_enmascarado` (o `sinpaga_bruto` si es un élite) |
| `hero` | `knight_m` original | `cobrador` |
| `orc` | `orc_warrior` original | `sinpaga_enmascarado` o retirar |
| `skeleton` | `skelet` original | `esqueleto_minero` |
| `wizard` | `wizzard_m` original | Se queda (no hay mago en la historia aprobada) |

## Terrenos

| Terreno | Superficie | Cara | `rim` |
|---|---|---|---|
| `stone` | `floor_1..4` de 0x72 | `stone_face_lip`: `wall_mid` con reborde iluminado de 3 px | `rim_stone` |
| `dirt` | Tierra de Ninja Adventure | `dirt_face`: acantilado de Ninja Adventure recoloreado a pardos 0x72, con reborde | `rim_dirt` |
| `slag` | `floor_6..8` de 0x72 | `slag_face`: acantilado recoloreado a escoria gris oscura | `rim_stone` |
| `wall` | `wall_top_1..2`: remate macizo oscuro con el canto iluminado de `wall_top_mid` (ya sin píxeles transparentes) | `wall_mid` | — |
| `planks` | `planks_1..3`: tablones con juntas, clavos y tizne | `planks_face`: muro de vigas y postes | `rim_wood` |
| `scaffold` (nuevo) | `scaffold_1..2`: tablillas sobre el vacío | `scaffold_face`: postes y aspa de madera | `rim_wood` |

`scaffold` es un terreno nuevo: para usarlo en un mapa hace falta su tile lógico en el tileset de Tiled (`terrain-logic`), que es cosa de la sesión principal.

## Props y FX (`props` del manifiesto, en `assets/0x72/extra.png`)

Cada entrada: `{ url, frames: Rect[], fps, loop, anchor: 'wall' | 'floor' | 'centre', light? }`.

| Id | Frames | Uso |
|---|---|---|
| `torch_wall` | 4, 8 fps, bucle, `light: #ffb060` | Antorcha de pared; sustituye a la llama por código |
| `brazier` | 4, 8 fps, bucle, `light: #ff9a4a` | Brasero de pie |
| `blood_1..3` | 1 | Manchas de sangre (decal de suelo) |
| `fx_hit_spark` | 4, 20 fps | Chispa de impacto |
| `fx_dust` | 5, 12 fps | Polvareda (pasos, caídas, empujones) |

Añadidos en la Fase 3:

| Id | Frames | Uso |
|---|---|---|
| `fx_explosion` | 7 frames de **32×32**, 14 fps, `anchor: centre`, `light: #ffb060` | Destello, bola de fuego, anillo de humo con brasas y humo que se disipa |
| `fx_steam` | 5, 10 fps | Vapor cuando el agua toca el fuego |

## Superficies (`surfaces` del manifiesto, en `assets/0x72/extra.png`)

Capa de 16×16 que se dibuja **encima del suelo** del tile (y debajo de entidades y objetos). Tienen píxeles semitransparentes y un borde irregular de 0 a 2 px, para que varios tiles seguidos se lean como una mancha continua. Forma: `{ url, frames: Rect[], fps, loop }` (como `props`, sin `anchor`). `fps: 0` significa estática.

| Id | Frames | Aspecto |
|---|---|---|
| `oil` | 1 | Charco negro brillante con irisaciones |
| `grease` | 1 | Mancha parda clara y resbaladiza |
| `fire` | 4, 8 fps, bucle | Brasas y tres lenguas de fuego desfasadas |
| `water` | 4, 5 fps, bucle | Charco azul translúcido con ondas |
| `ice` | 1 | Hielo pálido con grietas y canto iluminado |
| `electrified` | 4, 12 fps, bucle | Agua oscura con chispazos que saltan |
| `blood` | 1 | Charco rojo oscuro |
| `rubble` | 1 | Piedras y cascajo opacos (terreno difícil) |

## Objetos (`sprites`, `kind: 'frames'`)

Frame de 16×20 (la caja de 0x72 mide 16×24), pies abajo. `animations.idle` (1 frame) y `animations.broken` (1 frame: los restos).

| Id | Aspecto |
|---|---|
| `barrel` | Barril de duelas con aros de hierro |
| `barrel_oil` | Barril explosivo: pintado de rojo, franja de aviso amarilla y negra, marca de llama, aceite que gotea por el tapón y charquito al pie |
| `crate` | La caja de 0x72 tal cual; `broken` dibujado en sus colores |

## Peticiones al render

Para la sesión principal (`src/`). Ninguna es obligatoria: el arte ya funciona con el render actual, salvo lo que se indica.

1. **Props animados** (`manifest.props`): cargar la hoja, crear la animación con `fps`/`loop` y colocarla según `anchor` (`wall`: centrada en la cara del muro, encima; `floor`: pies en el centro del tile; `centre`: centro del tile). Para las luces fijas de Tiled, sustituir `FLAME_TEXTURE` de `src/fx/LightingLayer.ts` por `torch_wall` o `brazier` (una propiedad `prop` en el objeto luz) y mantener el resplandor aditivo encima.
2. **Decals de sangre**: al recibir daño cortante o perforante, `blood_N` aleatoria en el suelo bajo el objetivo, con profundidad justo por encima del suelo, que se desvanece a los N turnos (`juice.ts` ya dibuja partículas; esto sería el poso que queda).
3. **FX de impacto y polvo**: `fx_hit_spark` en el punto de impacto y `fx_dust` a los pies al moverse rápido, caer o ser empujado.
4. **Reborde de plataformas** (`terrain[].rim`): dibujar el frame `rim` (solo sus 4 filas superiores son opacas) una vez, justo debajo del borde sur de cada tile elevado, en vez de depender del reborde horneado en la cara (que se repite cada 16 px en desniveles de 3 o más niveles).
5. **Escala por sprite**: un `scale` opcional en `SpriteArt` (por ejemplo 1.15 para `garran`, que en 0x72 sale más bajo que los humanos) y respetar sprites de 32×36 (`absalon`, `sinpaga_bruto`), que ya funcionan porque el pivote está en los pies.
6. **Terreno animado** (opcional, futuro): `frames` por variante con `fps`, para agua o lava.
7. **Reproductor de cinemáticas** (Fase 6): ver abajo.
8. **Superficies** (`manifest.surfaces`, Fase 3): un sprite por tile con superficie, a la profundidad del suelo + 1 (encima de su tile y de las sombras de relieve, debajo de entidades). En las animadas, desfasar el frame inicial por posición (por ejemplo `variantHash(x, y) % frames`) para que un charco grande no ondule al unísono. En las estáticas, voltear en X o Y según `variantHash` para romper la repetición. Si el tile está elevado, colocarla sobre la cara superior (no en la cara).
9. **Luz de las superficies**: `fire` y `electrified` deberían iluminar (`#ff9a4a` radio ~1,5 tiles y `#a0e8ff` radio ~1 con parpadeo fuerte), igual que las antorchas. Es render puro mientras el motor no lo pida en las reglas.
10. **Objetos rompibles**: al destruirse `barrel`, `barrel_oil` o `crate`, pasar a `animations.broken` (que se queda en el suelo como restos) y, en `barrel_oil`, lanzar `fx_explosion` centrada en el tile (32×32, mayor que un tile: profundidad por encima de las entidades) más temblor de cámara. `fx_steam` donde el agua apaga fuego.
11. **Bordes de superficie** (opcional, futuro): si el borde irregular no basta, se pueden generar 16 máscaras de borde por vecinos (autotile de 4 bits) desde el mismo script; pedirlo si hace falta.

### Reproductor de cinemáticas

Formato (`content/<juego>/cinematics/intro.json`, generado):

```json
{ "size": [320, 180], "panels": [
  { "id": "p01-libro", "image": "p01-libro.png", "lines": ["…"], "durationMs": 7000,
    "effect": "fade", "effectParams": { … }, "voice": "comunicado" } ] }
```

- `image` está en `public/assets/cinematics/`. Algunas viñetas son más grandes que 320×180 (400×180 o 320×240) porque llevan `pan`.
- Escalar con vecino más cercano y escala entera; bandas negras si no cuadra.
- Texto en caja inferior con máquina de escribir, una línea de `lines` tras otra; botón «Saltar» desde el primer segundo; avance por tiempo o toque.
- Efectos usados: `fade`, `pan` (`from`/`to` en píxeles de la imagen), `zoom` (`from`/`to`/`centre`), `shake` (`atMs`, `intensity`), `flicker`, `pulse` (`color`), `sink`, `fall` (`scroll`, `shake`), `spotlight`, `crumble`, `confetti`, `blink`, `drop`; partículas opcionales en `effectParams.particles` (`rain`, `steam`). Los que el reproductor no conozca se pueden ignorar sin romper nada.
- `voice`: `narrador` por defecto; `comunicado` (Willy, viñeta 5) en tono de megafonía. Detalles de la voz sintetizada en `docs/willy/INTRO.md` (rama `willy`).
- La corrección de color de la cámara se aplica en ejecución: las viñetas no la llevan horneada.
