# Catálogo de arte del preset 0x72 (*Intereses*)

Qué ids puede usar el contenido, de dónde sale cada pieza y qué le falta al render para aprovecharlas. Todo se regenera con `npm run art`. Previsualizaciones en [`docs/art-previews/`](art-previews/).

## Pipelines

| Script | Entrada | Salida | Qué hace |
|---|---|---|---|
| `scripts/art/build-extra-art.ts intereses 0x72` | (código) | `art-src/generated/intereses-0x72-extra.png` + `.txt`, `public/assets/0x72/extra.png`, `props`, `surfaces` y los sprites `barrel`, `barrel_oil`, `crate` del manifiesto | Dibuja píxel a píxel, con la paleta de 0x72 (`pixel.ts`) y RNG con semilla: tablones, andamios, remate de muro, caras con reborde, rebordes sueltos, antorcha, brasero, FX, y (en `environment-art.ts`) superficies, barriles, explosión y vapor. Recolorea por luminancia las caras de acantilado de Ninja Adventure. |
| `scripts/art/build-tiles.ts intereses 0x72` | `content/intereses/art/0x72/tiles.json` | `public/assets/0x72/tiles/terrain.png`, `terrain` del manifiesto | Ahora admite celdas `{ "atlas": "<hoja>.png", "sprite": "nombre" }` (con lista `<hoja>.txt`) y un `rim` opcional por terreno. |
| `scripts/art/build-atlas-sprites.ts intereses 0x72` | `sprites.json` | `sprites` del manifiesto | Sin cambios: personajes 0x72 tal cual. |
| `scripts/art/build-palette-variants.ts intereses 0x72` | `content/intereses/art/0x72/palettes.json` | `public/assets/0x72/characters.png`, `sprites` del manifiesto | Recolorea personajes 0x72: `map` (color exacto → color, o `transparent`), `adjust` (HSV por rango de tono), `prune` (borra el contorno que queda huérfano), `rules` (solo píxeles interiores o una franja de filas: así se pinta el collar de plata de Absalón). `decals` estampa detalles dibujados a mano (ASCII) en cada frame, relativos a la parte de arriba o de abajo del sprite para que sigan su balanceo; `padTop` añade filas transparentes encima para los que sobresalen (sombrero, pico). `aliases` da el mismo arte a ids antiguos. Para ver los colores de una base: `node scripts/art/build-palette-variants.ts intereses 0x72 --dump doc elf_f`. |
| `scripts/art/build-hand-sprites.ts intereses 0x72` | `content/intereses/art/0x72/hand-sprites.json` | `public/assets/0x72/hand.png`, `sprites` del manifiesto, `docs/art-previews/intereses-0x72-hand.png` | Personajes como partes ASCII que se apilan por frame con desplazamientos; sustituye al recolor del mismo id. En *Intereses*, Garrán y el Cobrador parten de los frames de 0x72 (`orc_warrior`, `doc`) retocados píxel a píxel, para que encajen con el pack. |
| `scripts/art/build-portraits.ts intereses 0x72` | `content/intereses/art/0x72/portraits.json` | `public/assets/0x72/portraits.png`, `portraits` del manifiesto, `docs/art-previews/0x72-portraits.png` | Bustos de 32×32 para el HUD: la parte de arriba del primer frame de idle, a escala entera, sobre un fondo enmarcado cuyo tono distingue grupo (cálido), enemigos (sangre), no muertos (frío) y neutrales. |
| `scripts/art/build-previews.ts intereses 0x72` | manifiesto | `docs/art-previews/0x72-{characters,terrain,props,surfaces}.png` | Hojas de revisión. |
| `scripts/art/build-cinematics.ts <juego>` | `content/<juego>/cinematics/intro.spec.json` | `public/assets/cinematics/*.png`, `cinematics/intro.json`, `docs/art-previews/<juego>-intro.png` | Viñetas de 320×180 compuestas con operaciones (degradados con tramado, polígonos, tiles y sprites de los packs, sprites del manifiesto, sprites ASCII dibujados a mano, montañas, casas, lluvia, público, luces, viñeteado, texto pixelado). |

## Sprites (`spriteId`)

Todos son `kind: 'frames'`, miran a la derecha y tienen `idle` (4) y `move` (4); los que indican «hit» tienen además `hit` (1).

| Id | Base 0x72 | Tamaño | Qué es |
|---|---|---|---|
| `cobrador` | `doc`, **retocado frame a frame** (`hand-sprites.json`) | 16×23, idle 4, run 4, hit 1 | Protagonista: capucha gris pizarra, bufanda oscura sobre la nariz (sin el pico), ojos claros y fríos, correa de latón con el sello del banco y **farol encendido** en la mano de atrás |
| `dorotea` | `elf_f` | 16×28, hit | Dorotea Vane: pelo negro, lazo azul tinta, vestido granate y **su libro de cuentas** («Le apunto») |
| `garran` | `orc_warrior`, **retocado frame a frame** (`hand-sprites.json`) | 16×27, `scale` 1.1, idle 4, run 4, hit 1 | Garrán Tizón: semiorco con las proporciones de 0x72, moño, hombreras de cuero, pantalón pardo y **pico de minero** a la espalda (mango y acero con los colores de las armas de 0x72) |
| `anselmo` | `dwarf_f` | 16×28, hit | Fray Anselmo: mediano con hábito pardo de capucha, cordón claro y **crucifijo de latón** |
| `sinpaga_cuchillero` | `elf_m` | 16×28, hit | Bandido Sinpaga, jubón rojo sucio y **cuchillo** en la mano |
| `sinpaga_enmascarado` | `masked_orc` | 16×23 | Bandido Sinpaga con **máscara de calavera** y ropa roja de la banda |
| `sinpaga_bruto` | `ogre` | 32×36 | Bruto Sinpaga, el Matón (élite grande), zamarra roja de la banda |
| `guardia_baron` | `knight_m` | 16×28, hit | Guardia del barón Mazo: acero mate, penacho granate |
| `guardia_baron_sargento` | `knight_f` | 16×28, hit | Sargento de la guardia: acero ennegrecido |
| `minero_cuadrilla` | `dwarf_m` | 16×28, hit | Minero enano de la Cuadrilla (clan Hulla) |
| `callado` | `dwarf_m` | 16×28, hit | Callado: piel cenicienta, barba plateada |
| `callado_palido` | `elf_m` | 16×28, hit | Callado joven: pálido, ojos sin color, harapos |
| `absalon` | `big_zombie` | 32×36 | Absalón Brea (jefe): calvo, curtido, collar de plata |
| `esqueleto_minero` | `skelet` | 16×21 | Esqueleto de la mina, hueso amarillento, **sombrero de minero con vela** |
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

**Lectura a primera vista:** cada miembro del grupo tiene un color y un detalle propio (pizarra y farol; verde oliva y pico; granate y libro; pardo y crucifijo). Los Sinpaga comparten el rojo sucio de la banda. Comparativa en [`art-previews/0x72-party-before-after.png`](art-previews/0x72-party-before-after.png).

## Retratos (`portraits` del manifiesto)

**Variantes del Cobrador** para elegir: [`art-previews/0x72-cobrador-variants.png`](art-previews/0x72-cobrador-variants.png) (a: bufanda, en uso; b: cuello alto; c: media máscara bajada y farol). Se cambian en `hand.variants` de `portraits.json`.

**Grupo (48×48, pintados):** `cobrador`, `garran`, `dorotea` y `anselmo` tienen bustos de 48×48 con cara propia (`hand` en `portraits.json`, pintados con formas y rampas de luz por `scripts/art/portrait-painter.ts`) en `assets/0x72/portraits-hand.png`. Vista previa: [`art-previews/0x72-portraits-hand.png`](art-previews/0x72-portraits-hand.png). **PNJ con más diálogo (48×48, mismo estilo):** `mazo`, `hilda`, `nella`, `odda`, `cirilo`, `lisandro`, `absalon` (Brea), `ivo` y `posadera` (Remedios). Se describen con el kit paramétrico `scripts/art/bust-kit.ts` (`kit`: piel, cuerpo, cuello, pelo, barba, ojos, cejas, boca y marcas) más formas propias en `under`/`shapes`. `posadera` es un alias de `aldeana` en `palettes.json` para que su busto no se aplique a todas las aldeanas: el reparto debe usar `spriteId: "posadera"`. **El resto (32×32)** se genera desde el sprite. El HUD debe usar escala entera según `w`/`h` de cada entrada: 48 a 1× en la barra del grupo y a 2× (96) en la ficha.

`{ [spriteId]: { url, x, y, w, h } }`, celdas de 32×32 en `assets/0x72/portraits.png`. Hay retrato para todos los personajes (también los alias e ids provisionales); no para `barrel`, `barrel_oil` ni `crate`. Vista previa: [`art-previews/0x72-portraits.png`](art-previews/0x72-portraits.png). El HUD debería escalarlos con vecino más cercano (`image-rendering: pixelated`) a 2× o 3×.

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

## Terrenos de exterior (el camino, Hondonegra y el Escorial)

Dibujados por `build-extra-art.ts` en una paleta seca, fría y apagada (la noche y el cielo cubierto los pone el filtro de cámara y la luz ambiente del mapa). Las caras de roca y tierra son los acantilados de Ninja Adventure (CC0) recoloreados. Antes y después, con los mapas reales: [`art-previews/0x72-camino-antes-despues.png`](art-previews/0x72-camino-antes-despues.png) y [`art-previews/0x72-plaza-antes-despues.png`](art-previews/0x72-plaza-antes-despues.png).

| Terreno | Superficie | Cara |
|---|---|---|
| `road`, `road_v` | Camino de tierra apisonada con rodadas (horizontal / vertical) y piedras sueltas | Talud de tierra |
| `scrub` | Hierba seca y matojos sobre tierra (4 variantes, poco contraste) | Talud de tierra |
| `mud` | Cuneta y barro con agua estancada | Talud de tierra |
| `rock` | Afloramiento de roca gris parda con grietas y liquen | Roca fracturada (para alturas) |
| `cobble` | Adoquín gastado de la plaza, con barro en las juntas | Mampostería |
| `house` / `house_plain` | Tejado de pizarra con musgo, visto desde arriba | Entramado de madera y revoque, con ventana / con riostra (alternar para que no se repita) |
| `stone_wall` | Remate de muro | Mampostería de piedra (muros del pueblo y de la abadía por fuera) |
| `fence` | Valla de madera vista desde arriba sobre matojos | Tablones grises |
| `river`, `riverbank` | El Lloro: agua gris de los relaves / orilla de barro con el agua lamiendo el borde norte | Talud de tierra |
| `slag_heap` | Escoria granulada con brasas y destellos de plata | Escoria gris oscura |

**Transiciones (`terrain.<id>.blend`)**: `{ priority, edges: { n, e, s, w, ne, nw, se, sw } }`, frames del mismo tileset. Cada frame es un flequillo irregular de la textura del terreno con un borde algo más oscuro; el render lo dibuja sobre la cara superior del vecino de menor prioridad (misma altura), en orden de prioridad; las esquinas solo cuando ninguno de los dos vecinos ortogonales es ese terreno. Prioridades: `scrub` 4; `mud`, `riverbank*`, `slag_heap` 3; `cobble` 2; `road`, `road_v` 1. La orilla tiene variantes por lado del agua: `riverbank` (agua al norte), `riverbank_s`, `riverbank_w` y `riverbank_e`.

## PNJ de Hondonegra y atrezo del pueblo (para `mapas` y `guion`)

Recolores de 0x72 con detalle propio (`palettes.json`). Vista previa: [`art-previews/0x72-npcs-hondonegra.png`](art-previews/0x72-npcs-hondonegra.png).

| Id | Base | Aspecto |
|---|---|---|
| `mazo` | `elf_m` | El barón Ulric Mazo: jubón morado con aro de oro y pluma de poeta |
| `hilda` | `elf_f` | Hilda Cardo, la senescal: moño gris, vestido gris verdoso, manojo de llaves |
| `cirilo` | `wizzard_m` | Cirilo Hondo, capellán de la Santa Pala: capucha y sotana pardas, barba gris, pala |
| `fanatico_pala` | `wizzard_f` | Fanático de la Santa Pala: capucha de arpillera ocre y pala |
| `nella` | `elf_f` | Nella Yesca: luto negro y pañuelo rojo de la Cuadrilla |
| `odda` | `dwarf_f` | Odda Hulla: trenzas cobrizas, ropa de mina, martillo |
| `lisandro` | `elf_m` | Lisandro Fuss, el prestamista elfo: levita verde oscuro, botones y bolsa de oro |
| `aldeano`, `aldeana`, `aldeano_viejo` | `elf_m`, `elf_f`, `wizzard_m` | Vecinos de Hondonegra con ropa gastada |

Ya existían: `absalon` (Brea), `callado`, `callado_palido`, `minero_cuadrilla`, `guardia_baron`, `guardia_baron_sargento`, los compañeros y los Sinpaga.

**Calles y Escorial** (vista previa: [`art-previews/0x72-escorial-calles.png`](art-previews/0x72-escorial-calles.png)):
- PNJ: `fiel_pala` (vecino con escapulario ocre de la Santa Pala) y `viuda` (velo y luto negros, para las viudas de los cuarenta).
- Props: `campfire` (hoguera de campamento, 4 frames, luz), `oil_cart` (carro de aceite de los Sinpaga con tres barriles, 32×20), `well` (el Pozo del Ahorcado, 16×24).
- Trampas detectadas (en lugar de los pinchos genéricos): `trap_beartrap` / `trap_beartrap_disarmed` (cepo), `trap_tripwire` (cuerda) y `trap_dart` (placa de dardo envenenado).

**Mina y Bóveda** (vista previa: [`art-previews/0x72-mina-boveda.png`](art-previews/0x72-mina-boveda.png)):
- Terrenos: `rails` (vía horizontal sobre piedra: traviesas y carriles), `rails_v` (vertical) y `vault` (losas antiguas con vetas de plata viva; cara tallada con runas).
- Objetos (`sprites`, `idle` + `broken`): `mine_wagon`, `mine_wagon_ore` (con mineral y destellos de plata), `powder_keg` (barrilete de pólvora con calavera y mecha) y `resonator` (resonador de plata viva que zumba: `idle` 4 frames con brillo; `broken` partido).
- Props: `fuse_charges` (la mecha de Garrán: cargas contra la roca y la mecha enrollada), `remains_forty` (huesos, casco, pico roto y la nómina del barón con un destello de las treinta coronas), `pulley` (polea y cadenas con el cubo de mineral, `wall`, 16×32), `inscription` (inscripción élfica con runas encendidas, `wall`) y `trap_rotten_plank` (el tablón podrido, detectado).
- PNJ: `ivo` (el medio hermano de Garrán entre los Callados: pálido, pelo negro, pañuelo rojo de minero).

**Atrezo** (`props`): `tapestry` (tapiz con el escudo de los Mazo, `wall`, 16×24), `tapestry_crossbow` (el mismo con la punta de la ballesta asomando: la pista para la frase de Garrán) y `gallows` (horca de la Torre del Cepo, `floor`, 16×32).

## Objetos interactivos (Fase 4)

Vista previa: [`art-previews/0x72-interactables.png`](art-previews/0x72-interactables.png).

| Id | Dónde | Frames |
|---|---|---|
| `chest` | `sprites` (cofre de 0x72) | `idle` (cerrado), `opening` (3), `open` (con botín), `empty` (abierto y vacío) |
| `chest_trapped` | `sprites` | Igual que `chest`; **solo cerrado** lleva la pista: una aguja verdosa en la cerradura, un hilo tenso al pie y una mancha oscura en el lateral |
| `lever` | `sprites` (palanca de 0x72) | `up`, `down`, `pull` (arriba → abajo); `idle` = arriba |
| `door_closed` | `terrain` (para `setTile`) | Superficie: dintel de madera entre sillares; cara: puerta de tablones con flejes y aldaba en marco de piedra |
| `door_open` | `terrain` | Superficie: suelo con umbral y la hoja abierta contra la jamba; cara: hueco oscuro enmarcado |
| `trap_armed` | `props` (`floor`, 4 fps) | Pinchos de 0x72 fuera, con destello; sustituye al marco rojo por código |
| `trap_disarmed` | `props` (`floor`) | Pinchos retraídos y apagados |

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

---

# *Willy el mazmorrero* (preset `ninja`)

Encargo: `docs/willy/ART_BRIEF.md`. Especificación en `content/willy/art/ninja/`, salida en `content/willy/public/assets/ninja/` y manifiesto `content/willy/assets/ninja.json` (mismo esquema que *Intereses*). Paleta más saturada y luminosa; mismo tamaño de pixel que 0x72.

## Retratos de 48×48 de *Willy*

`paco`, `koldo`, `maripuri`, `xelda` y `jefe-presentador` tienen bustos pintados de 48×48 (kit de `bust-kit.ts`, `size: 48` en `portraits.json`) en `assets/ninja/portraits-hand.png`; los patrocinadores siguen en 32×32. Vista previa: [`art-previews/ninja-portraits-hand.png`](art-previews/ninja-portraits-hand.png).

## Willy y los PNJ del Camerino (`hand-sprites.json`)

Dibujados a mano como partes ASCII: `willy` es la plantilla (gorra, bigote, cuerpo corpulento; 16×30 con hueco arriba para accesorios) y cada clase la **extiende** con su paleta y accesorios anclados al cuerpo (`extends`, `under`, `over` en `build-hand-sprites.ts`). `idle` 4 y `move` 4 frames. Vista previa: [`art-previews/willy-ninja-hand.png`](art-previews/willy-ninja-hand.png).

| Id | Aspecto |
|---|---|
| `willy-butanero` | Mono naranja con logo y bombona a la espalda |
| `willy-influencer` | Chaqueta fucsia brillante, vaqueros y palo de selfie con móvil |
| `willy-bardo-de-verbena` | Camisa roja de orquesta con lentejuelas doradas y teclado colgado |
| `willy-socorrista` | Gorra roja, camiseta amarilla, bañador rojo, chanclas y silbato |
| `willy-tasador` | Chaleco, cadena de reloj, guantes blancos y monóculo |
| `willy-mimo` | Cara blanca, boina negra y camiseta de rayas |
| `willy-ingeniero` | Casco amarillo con antena, mono gris y soldador |
| `willy-funcionario` | Camisa azul, corbata roja, manguitos negros y sello |
| `willy-jugador-de-basket` | Camiseta de tirantes blanca y verde, cinta roja, balón; **3 px más alto** |
| `paco` | Pelo cano, camisa verde, mandil blanco (el mismo Paco del prólogo) |
| `koldo` | Chubasquero amarillo y txapela |
| `maripuri` | Rizos canos, gafas, carmín, bata de flores rosa y zapatillas |
| `xelda` | Alienígena verde azulada con antenas, **cuatro brazos** y chaqueta morada de staff |

## Enemigos de la Planta 1 (Castro Sumergido)

16×16, `idle` 4 y `move` 4. Dibujados a mano (`hand-sprites.json`) salvo el mímico (cofre de 0x72 recoloreado en `palettes.json`).

| Id | Aspecto |
|---|---|
| `gaviota-de-lonja` | Gaviota gorda, pico amarillo con la mancha roja, patas naranjas; aletea al moverse (vuela) |
| `rata-portuaria` | Gris parda, ojos rojos; orejas, hocico y cola rosas |
| `cangrejo-con-casco` | Cangrejo rojo con casco de obra amarillo y pinzas en alto; se mueve de lado |
| `bocarte-andante` | Anchoa plateada y azul con dos patitas |
| `mimico` | Cofre de 0x72 con dientes; en `idle` casi siempre cerrado (disfrazado), en `move` abre y cierra la boca |

## Cajas de botín (`sprites`)

16×16 con `idle` (cerrada), `open` (abierta) y `opening` (3 frames). Colores según `rarezas` de `loot-tables.json`.

| Id | Aspecto |
|---|---|
| `caja-bronce` | Caja de cartón con cinta y el logo rojo de Canal Abismo (dibujada a mano) |
| `caja-plata` | Cofre metálico con remaches y lazo azul (recolor de `chest_full` de 0x72 con decal) |
| `caja-oro` | Cofre dorado con herrajes de oro viejo |
| `caja-legendaria` | Cofre morado del plató con neón cian y gema fucsia; **el render debería hacerlo flotar** (balanceo vertical de 1-2 px) |

## Terrenos de Castro Sumergido y del Camerino (`tiles.json`, dibujados por `build-willy-art.ts`)

| Terreno | Superficie | Cara |
|---|---|---|
| `piedra-mojada` | Adoquines grises mojados con brillos (3 variantes) | Muro de muelle con línea de marea y algas |
| `agua` | Agua por los tobillos sobre adoquines, con ondas y espuma (2) | Muro de muelle |
| `muelle` | Losas de arenisca, una con argolla de amarre | Muro de muelle (el borde con caída) |
| `soportal` | Baldosas de damero gastadas | Arco abierto a la sombra |
| `lonja` | Azulejo blanco con escamas y sumidero | Fachada ocre |
| `muro-castro` | Tejado de teja roja visto desde arriba | Fachada ocre con ventana de contraventanas verdes |
| `moqueta` | Moqueta de terciopelo rojo con rombos dorados | Pared del plató |
| `tarima` | Tarima de escenario con marcas de cinta | Pared del plató |
| `muro-plato` | Techo del plató | Pared morada con tira de neón |

Vista previa: [`art-previews/ninja-terrain.png`](art-previews/ninja-terrain.png).

## Mobiliario del Camerino (`props`, en `assets/ninja/extra.png`)

| Id | Tamaño | Notas |
|---|---|---|
| `espejo-bombillas` | 16×16, 2 frames (bombillas que parpadean), `wall`, luz `#fff0c0` | Espejo de camerino |
| `mostrador-maripuri` | 32×20, `floor` | Mostrador de ultramarinos con tortilla, cubo de agua, tarro y botella |
| `barra-paco` | 32×20, `floor` | Barra con grifos de cerveza y cafetera |
| `mesa-xelda` | 32×22, `floor`, luz `#4fe8ff` | Mesa de producción con dos monitores (gráfica de audiencia) y portapapeles |
| `ascensor-servicio` | 16×32, frames cerrado/abierto, `wall` | Ascensor de servicio con piloto rojo/verde |

Vista previa: [`art-previews/ninja-props.png`](art-previews/ninja-props.png).

## Marcos de carta por rareza (`ui` del manifiesto)

`{ url, x, y, w: 24, h: 24, slice: 8 }`: marco *9-slice* (esquinas de 8 px) para `carta-bronce`, `carta-plata`, `carta-oro` y `carta-legendaria`, con los colores de `rarezas`. **Petición al render:** dibujarlos con `border-image` (CSS) o *nine-slice* escalado entero.

## P2: invocaciones, utilería del plató, superficies, efectos y HUD

**Invocaciones** (`sprites`, dibujadas a mano en `hand-sprites.json`):

| Id | Aspecto |
|---|---|
| `automata-repetidor` | Cubo de chapa con patas, pantalla de ojos cian y antena con luz verde que parpadea (16×16; idle 2, move 4) |
| `antena-repetidora` | Mástil de celosía de 16×32 con emisores cian y piloto rojo (idle 2) |
| `chencho-el-base` | Bajito, cinta roja, camiseta de tirantes blanca y verde del Brazomar (16×22) |
| `fan-entusiasta` | Fan de la Influencer: alienígena peludo morado con mano de espuma que da saltitos. **Id propuesto**: los datos solo dicen «un fan»; usar este `spriteId` en la invocación |

**Objetos** (`sprites`, con `idle` y `broken` donde aplica): `barril`, `barril-explosivo` (el mismo arte que el barril de aceite de *Intereses*) y `carrito`.

**Utilería del plató** (`props`):

| Id | Notas |
|---|---|
| `foco-movil` | Foco sobre pie que barre izquierda-centro-derecha (16×20, 4 frames), luz `#fff4c8` |
| `cono-de-luz` | Cono translúcido de 32×48 para dibujar bajo el foco (mejor en modo aditivo) |
| `camara-dron` | Cámara-dron con rotores animados y piloto rojo (16×12) |
| `cartel-en-directo` | Caja de luz roja «EN DIRECTO» (43×11), encendida/apagada |
| `parrilla-de-focos` | Truss de 48×10 con tres focos de colores que se alternan |

**Superficies** (`surfaces`, ids de `RULESET.md` → Superficies): `agua`, `aceite`, `fuego`, `hielo`, `electrificada` (las mismas que *Intereses*), `vapor` (nube que tapa la vista), `toxico` (con burbujas), `canicas`, `red`, `expedientes` y `expedientes-ardiendo`. Vista previa: [`art-previews/ninja-surfaces.png`](art-previews/ninja-surfaces.png).

**Efectos** (`props`, ancla `centre`): `fx-arco-voltaico` (32×16), `fx-onda-5g` (un anillito triste que se desinfla y unos puntos suspensivos) hasta `fx-onda-10g` (64×64: anillos de colores, destello y rayos; **el render puede escalarlo a toda la pantalla**), `fx-impreso-volador`, `fx-balon-estela`, `fx-confeti` (la despedida del fan), `fx-vapor` y `fx-explosion`.

**HUD** (`ui` y `portraits`):
- Retratos de los 6 patrocinadores a 32×32, pintados: `patrocinador-butanos-perez` (tres nubes de gas naranja con bigote), `patrocinador-la-prudente` (asteroide blindado con escudo azul), `patrocinador-vortax` (emperador lila aburrido, corona y cuello granate), `patrocinador-clementina` (cocinera rosa con gorro, varios brazos, cuchara y sartén), `patrocinador-colmena` (racimo de abejas), `patrocinador-glorp` (gota verde con gafas de pasta y hoja). Vista previa: [`art-previews/ninja-portraits-hand.png`](art-previews/ninja-portraits-hand.png).
- Retratos generados (32×32) de Willy en todas sus clases, los PNJ, los enemigos y las invocaciones: [`art-previews/ninja-portraits.png`](art-previews/ninja-portraits.png).
- Iconos de 12×12 (`ui`, `icono-<id>`): `audiencia`, `reloj` y uno por estado de `RULESET.md` → Condiciones (`ardiendo`, `empapado`, `congelado`, `electrocutado`, `envenenado`, `tumbado`, `aturdido`, `asustado`, `cegado`, `enredado`, `bailando`, `mareado`, `escondido`, `animado`, `dormido`, `petrificado`, `compulsado`, `afortunado`).
- Tipografía: Press Start 2P (títulos) y VT323 (texto) son fuentes OFL de Google Fonts; las carga el cliente, no hacen falta en el pipeline de arte.

## P3: mazmorreros rivales modulares (`rivals.json`, `scripts/art/build-rivals.ts`)

Vista previa (paletas por raza, legendarios y combinaciones al azar): [`art-previews/willy-rivals.png`](art-previews/willy-rivals.png).

- **Cuerpos base** (`sprites`, `idle` 2 y `move` 4): `rival-cuerpo-semigaviota` (16×26), `rival-cuerpo-gnomo-de-jardin` (16×22, cerámico: no respira, se bambolea al andar), `rival-cuerpo-orco-de-oficina` (16×26, camisa blanca), `rival-cuerpo-fantasma-en-practicas` (16×22, **translúcido**, flota, con la placa verde de «L» de prácticas) y `rival-cuerpo-minotauro-vegano` (24×36, dos casillas de alto, delantal verde). Una sola silueta por raza.
- **Paletas**: cada cuerpo ya recoloreado con sus 5 paletas de `rival-generator.json` como sprite propio: `rival-cuerpo-<raza>--<paleta>` (p. ej. `rival-cuerpo-semigaviota--gaviota-reidora`, `rival-cuerpo-minotauro-vegano--berrendo`). El id sin paleta es la primera.
- **Accesorios** (`rivals.accessories.<ranura>.<id>`: `{ url, x, y, w, h, pivot }`): los 11 de cabeza, 7 de cara y 9 de mano de `rival-generator.json`, exagerados para leerse a 16 px.
- **Anclajes** (`rivals.bodies.<raza>.anchors.<anim>[frame]` → `{ cabeza, cara, mano }` en píxeles del frame): ya siguen el balanceo del cuerpo. El cliente dibuja el accesorio con su `pivot` sobre el anclaje y voltea los dos si el rival mira a la izquierda. `rivals.bodies.<raza>.palettes` da el `spriteId` de cada paleta.
- **Legendarios** (`sprites`, compuestos): `rival-vanesa` (gaviota patiamarilla, gafas de sol, bolsa de pipas, carmín), `rival-ceferino` (gorro rojo clásico, monóculo y caña de pescar), `rival-gorka` (verde oliva, corbata roja, gafas de pasta, maletín), `rival-mariluz` (sábana blanca, flor, abanico y colorete) y `rival-asterio` (castaño, aro en la nariz y zanahoria).

**Petición al render:** componer rivales = sprite de cuerpo con paleta + hasta 3 accesorios en sus anclajes (mismo frame, misma profundidad +1). Para los accesorios de mano conviene dibujarlos detrás del cuerpo cuando mira a la izquierda (mano de atrás), o aceptar que siempre queden delante.

## P3: el Presentador y su plató (Planta 5)

Vista previa: [`art-previews/willy-plato.png`](art-previews/willy-plato.png).

| Id | Tipo | Aspecto |
|---|---|---|
| `jefe-presentador` | sprite (16×30, idle 4, move 4) | Pelo engominado con sienes canas, piel algo pálida, sonrisa con colmillos discretos, **un único brillo rojo en un ojo**, traje impecable con corbata granate y micrófono. Caricatura amable, sin parecido con nadie |
| `jefe-presentador-murcielagos` | sprite (32×24, 4 frames) | Fase 2, «Pausa publicitaria»: nube de ocho murciélagos con micrófonos diminutos |
| `atril-rojo`, `atril-azul`, `atril-verde` | props (16×20, `floor`) | Atriles de concursante; frame 0 apagado, frame 1 con el pulsador encendido |
| `panel-de-preguntas` | prop (48×32, `wall`) | Panel con la pregunta y respuestas A/B/C; frame 0 sin respuesta, frames 1-3 iluminan A, B o C |
| `plato` | terreno | Suelo negro brillante del plató con marcas de cinta |
| `baldosa-<color>` y `baldosa-<color>-encendida` | terreno (`roja`, `azul`, `verde`, `amarilla`) | Baldosas de respuesta: apagadas (tramadas) y encendidas; el cambio es un `setTile` |
| `trampilla-abierta` | terreno | Trampilla de escenario abierta (la caída de 1 nivel) |
| `gradas` | terreno | Gradas vistas desde arriba con el público (no transitables) |

Los focos, su cono, la parrilla de focos y las cámaras-dron ya estaban en P2.

## P3: jefes y enemigos de todas las plantas (`hand-sprites.json`)

Vista previa: [`art-previews/willy-ninja-hand.png`](art-previews/willy-ninja-hand.png). Los humanoides extienden la plantilla de Willy (sin parecerse a él: otra paleta y otros accesorios). Los jefes grandes se dibujan pequeños y llevan `scale` 2 en el manifiesto.

| Planta | Ids |
|---|---|
| 1 | `jefe-centollo` (centollo enorme con corona, 24×18, `scale` 2) |
| 2 · Hipermercado | `maniqui` (sin cara, conjunto de temporada), `carrito-poseido` (ojos verdes furiosos), `reponedor-zombi` (piel verdosa, chaleco del híper, caja al hombro), `etiqueta-de-oferta` (etiqueta voladora con «%»), `jefe-encargada` (Doña Rebeca: permanente caoba, gafas, chaleco rojo y pistola de etiquetas) |
| 3 · Verbena | `cabezudo` (cabezón de cartón piedra con vejiga), `musico-de-charanga` (camisa blanca, pañuelo rojo, trompeta), `vaquilla` (becerra negra con manchas), `feriante` (tirantes, gorra, petardo), `jefe-giganton` (gigante de fiestas con corona y faldón, 20×32, `scale` 2) |
| 4 · Balneario | `patito-gigante` (`scale` 1.5), `yeti-de-sauna` (peludo, colorado, toalla, sudor), `medusa-de-piscina` (rosa translúcida), `monitor-de-aquagym` (polo turquesa, churro de piscina), `jefe-socorrista` (criatura abisal con camiseta de socorrista sentada en su silla, tentáculos, 20×24, `scale` 2) |
| 5 · Plató | `regidor` (cascos con micro, portapapeles), `tecnico-de-sonido` (auriculares, pértiga), `figurante` (romano de cartón), `camara-dron` (enemigo) |

`mimico` sale en todas las plantas (ya estaba en P1).

## P3: terrenos de las Plantas 2-4

Vista previa (superficie y cara de cada terreno): [`art-previews/willy-plantas-2-4.png`](art-previews/willy-plantas-2-4.png).

| Planta | Terrenos |
|---|---|
| 2 · Hipermercado | `hiper` (linóleo), `hiper-oferta` (flecha de oferta), `estanteria` (góndola vista desde arriba; cara: baldas con productos), `cinta` (cinta transportadora con galones; la planta 2 la usa como terreno que empuja) |
| 3 · Verbena | `verbena` (adoquines con confeti y serpentinas), `escenario` (tarima de orquesta con bombillas; cara: faldón rojo con flecos), `muro-verbena` (tejados con banderines; cara: fachada encalada con balcón y maceta) |
| 4 · Balneario | `azulejo` (gresite azul claro), `piscina` (agua profunda con reflejos), `hielo-balneario` (azulejo helado con grietas), `muro-balneario` (techo nevado; cara: azulejo blanco con franja azul y carámbanos) |

## Atrezo de bioma de las Plantas 2-5

Vista previa: [`art-previews/willy-biome-props.png`](art-previews/willy-biome-props.png). Los que son entidades (`sprites`, con `spriteId` en `prop(...)` de `maps.ts`) ocupan casilla; los `props` del manifiesto son decoración que dibuja el cliente.

| Planta | `sprites` (entidades) | `props` (decoración) |
|---|---|---|
| 2 · Hipermercado | `estanteria-hiper` (16×24; `broken`: volcada con género por el suelo), `caja-registradora` (16×20), `cesta-ofertas`, `carrito` (ya existía) | La cinta es el terreno `cinta` |
| 3 · Verbena | `altavoz-verbena` (16×24, bocina en poste), `caseta-feria` (32×24, «TOMBOLA» con toldo) | `farolillo` (pared, 2 frames, luz `#ffb040`), `banderines` (pared, 32×8) |
| 4 · Balneario | `tumbona`, `flotador`, `sombrilla` (16×28) | `escalera-piscina` (suelo, borde de la piscina), `puerta-sauna` (pared, 16×24, vapor animado) |
| 5 · Plató | `camara-estudio` (16×24, piloto rojo parpadeando en `idle`), `monitor-escenario`, `silla-director` (16×20) | `cables` (suelo), `claqueta` (suelo) |

Las luces del plató ya existían en P2: `foco-movil`, `cono-de-luz` y `parrilla-de-focos`.

# Pantallas de título

| Juego | Imagen | Contenido |
|---|---|---|
| *Intereses* | `content/intereses/public/assets/title/title.png` (`assets/title/title.png`) | Noche en el valle: el sello de lacre del banco con una llave, como una luna roja, detrás del castillete de la mina; cuervos, lluvia, la casa de máquinas encendida y los raíles. Logotipo «INTERESES» y lema «Lo que no tiene precio, tiene intereses». |
| *Willy* | `content/willy/public/assets/title/title.png` | Plató de Canal Abismo: estallido rojo con «WILLY» y cinta «EL MAZMORRERO», «Un concurso de Canal Abismo», focos, confeti, cámaras-dron, Willy con la bombona en el escenario y el público. Mosca del canal y «En directo» en las esquinas. |

Las dos son de 320×180 y se escalan a múltiplos enteros con vecino más cercano. El logotipo y la figura central caben en los 180 px del centro, así que un recorte `cover` en vertical sigue funcionando. Se generan con `node scripts/art/build-cinematics.ts <juego> title` desde `content/<juego>/cinematics/title.spec.json` (mismas operaciones que la intro, más `text` con `font: "big"`, `bold`, `outline` y `highlight`). Vistas previas: [`art-previews/intereses-title.png`](art-previews/intereses-title.png) y [`art-previews/willy-title.png`](art-previews/willy-title.png). **Petición al cliente:** cargarlas en la pantalla de título; no llevan colour grade.

# Efectos de conjuros y habilidades (*Intereses*, `props` de `assets/0x72/extra.png`)

Dibujados por `scripts/art/spell-fx.ts` con rampas de la paleta de 0x72 (fuego, escarcha, rayo, arcano, radiante y curación). Vista previa con todos los frames: [`art-previews/0x72-spell-fx.png`](art-previews/0x72-spell-fx.png). Los proyectiles miran a la derecha: el cliente los gira según el ángulo de la trayectoria.

| Conjuro | Ids | Cómo se reproduce |
|---|---|---|
| Rayo de fuego | `fx_firebolt`, `fx_firebolt_impact` | Proyectil en bucle del lanzador al objetivo (unas 12 casillas/s); al llegar, el impacto una vez en el objetivo. |
| Rayo de escarcha | `fx_ray_of_frost`, `fx_frost_impact` | Rayo: repetir el tramo de 16 px a lo largo de la línea lanzador→objetivo (girado), en bucle durante ~0,4 s; luego el impacto en el objetivo. |
| Agarre electrizante | `fx_shocking_grasp` | Una vez sobre el objetivo, a la vez que el ataque cuerpo a cuerpo. |
| Proyectil mágico | `fx_magic_missile`, `fx_magic_missile_impact` | Un dardo por proyectil, lanzados con ~80 ms de desfase y una curva leve si se quiere; impacto al llegar cada uno. |
| Manos ardientes | `fx_burning_hands` | Una llamarada por casilla afectada del cono, con un retardo de ~40 ms por casilla de distancia al lanzador. |
| Onda atronadora | `fx_thunderwave` | Una vez, centrada en el lanzador (48×48 cubre el cubo de 3×3); temblor de cámara corto. |
| Bola de fuego | `fx_fireball_bead`, `fx_fireball`, `fx_burning_hands` | La cuenta vuela al punto elegido; allí, el estallido de 64×64 (escalar ×2 para el radio de 20 pies) y, si se quiere, `fx_burning_hands` en cada casilla afectada. |
| Saeta guía | `fx_guiding_bolt`, `fx_guiding_bolt_impact` | Proyectil del lanzador al objetivo e impacto; el brillo que deja en el objetivo puede ser `fx_bless` teñido o la `light` del impacto. |
| Llama sagrada | `fx_sacred_flame` | Una vez en la casilla del objetivo (16×32, los pies abajo): cae del cielo, no hay proyectil. |
| Curar heridas / Palabra curativa | `fx_healing` | Una vez en cada objetivo curado (16×24, los pies abajo). |
| Bendición | `fx_bless` | En bucle sobre cada objetivo mientras dure la condición (halo sobre la cabeza). |
| Expulsar muertos vivientes | `fx_holy_symbol`, `fx_turn_undead` | El destello sobre el lanzador y a la vez el anillo de 64×64 centrado en él (escalar al radio de 30 pies si hace falta). |

# Animaciones de acción (*Intereses*, `actions.json`)

`cobrador`, `garran`, `dorotea`, `anselmo`, `sinpaga_cuchillero`, `sinpaga_enmascarado`, `sinpaga_bruto`, `callado`, `esqueleto_minero` y `absalon` (y los alias `bandit` y `thug`) tienen, además de `idle`, `move` y `hit`, tres animaciones nuevas en `sprites.<id>.animations`:

- `attack` (4 frames, ~10 fps, sin bucle): preparación, golpe con estela del arma (`slash`, tajo en arco; `thrust`, estocada; `blunt`, golpe de arriba abajo con polvo), seguimiento y vuelta a la postura.
- `cast` (4 frames, ~8 fps, sin bucle): brillo en la mano, el brillo crece y tiñe el borde del cuerpo con el color del conjuro, y se suelta. Lanzar el efecto del conjuro en el frame 3.
- `hurt` (2 frames, ~12 fps, sin bucle): destello blanco y retroceso con tinte rojo.

Se derivan del frame `idle` de cada personaje con `scripts/art/build-action-anims.ts`, así que conservan el estilo de 0x72. Todos los frames de estos sprites pasan a `assets/0x72/actors.png`. Los frames nuevos son más anchos (relleno simétrico de 4 px, 8 px en los de 32), así que el pivote de los pies no se mueve. Vista previa: [`art-previews/0x72-actions.png`](art-previews/0x72-actions.png). **Petición al cliente:** reproducir `attack`, `cast` y `hurt` cuando lleguen los eventos correspondientes y volver a `idle`.

# Fuentes de luz y palanca (pulido de la demo)

| Id | Tipo | Descripción |
|---|---|---|
| `candles` | prop, `floor`, luz `#ffc070` | Tres velas de sebo con goterones (capilla, cripta). 3 frames. |
| `oil_lamp` | prop, `floor`, luz `#ffb050` | Candil de barro colgado del brazo de su propio poste de madera: vale en suelo abierto y junto a un muro. 3 frames. |
| `lantern` | prop, `floor`, luz `#ffb050` | Farol de hierro con ventanas de cuerno. 3 frames. |
| `lever` | sprite (`idle`, `up`, `down`, `pull`) | Palanca redibujada sobre placa de piedra, con pomo rojo grande: se lee como algo que se usa. Sustituye a la de 0x72. |

Las luces sin `prop` en los mapas iluminan sin que se vea de dónde sale la luz. Sugerencia para `mapas`:

- `candles` para `velas-capilla-*` y `vela-cripta`.
- `oil_lamp` para `candil-*` y `lampara-empenos`.
- `lantern` para `farol-pozo` y `farol-polvorin`.
- `campfire` para las `hoguera-*` si no tienen ya un spawn `campfire` debajo.
- Los `brillo-*` (plata, resonadores) pueden seguir sin prop.

**Aros de bando** (props `floor`, 16×7, dibujar bajo los pies): `marker_party` (dorado, continuo), `marker_ally` (verde, a trazos: aliados que luchan por el grupo con IA), `marker_enemy` (rojo, grueso) y `marker_neutral` (gris, a trazos). **Petición al cliente:** el mapa solo marca al personaje activo; estos aros permiten distinguir bandos de un vistazo.

## Compañeros de *Willy* (uno por clase)

Sprites a mano (`hand-sprites.json`, `idle` y `move`, mirando a la derecha; el cliente los voltea) y bustos de 48×48 (`portraits.json`, con el mismo id). Vista previa: [`art-previews/willy-ninja-hand.png`](art-previews/willy-ninja-hand.png) y [`art-previews/ninja-portraits-hand.png`](art-previews/ninja-portraits-hand.png).

| Id | Clase | Aspecto |
|---|---|---|
| `companero-jonatan` | butanero | Aprendiz: gorra del revés, mono naranja y azul, carretilla de una rueda con un camping gas |
| `companero-kevin` | influencer | Sudadera, cascos al cuello, móvil vertical en estabilizador y foco LED |
| `companero-loli` | bardo-de-verbena | Cantante de orquesta: permanente cardada, lentejuelas, micro con cable en espiral |
| `companero-neptuno` | socorrista | Terranova negro con chaleco salvavidas naranja (16×22, ancho) |
| `companero-rosario` | tasador | Doña Rosario: bajita, permanente gris, abrigo negro, perlas y bolso enorme |
| `companero-plata` | mimo | Estatua humana plateada con bombín; `idle` congelado con el sombrero de las monedas, `move` a tirones |
| `companero-tornillo` | ingeniero | Autómata de hojalata redondeado: una antena, soplete por mano, le falta un tornillo (16×22) |
| `companero-iker` | funcionario | Becario: camisa grande, corbata torcida, acreditación, gafas, grapadora y termo |
| `chencho-el-base` | jugador-de-basket | Sprite existente; busto nuevo con la cinta roja |

# Tabla `fx` del manifiesto (las dos partidas)

Cada partida describe cómo se reproduce el efecto de cada conjuro o habilidad en `content/<juego>/art/<preset>/fx.json`. `build-extra-art.ts` y `build-willy-art.ts` lo copian a `fx` del manifiesto con `scripts/art/fx-table.ts`, que comprueba que cada prop nombrado existe. La clave es el id del conjuro o habilidad; las claves que empiezan por `@` son ganchos que no son habilidades (`@critical`: golpe crítico). Las entradas tienen la misma forma que la antigua tabla `SPELL_FX` del cliente:

| `kind` | Campos | Cómo se reproduce |
|---|---|---|
| `projectile` | `fx`, `impactFx?`, `tilesPerSec?`, `count?`, `staggerMs?` | Del lanzador al objetivo, girado según la trayectoria; `count` > 1 lanza varios con desfase |
| `ray` | `fx`, `impactFx?`, `durationMs?` | Estirado a lo largo de la línea lanzador→objetivo durante `durationMs`; luego el impacto |
| `instant` | `fx` | Una vez en el objetivo (o en el lanzador si no hay objetivo) |
| `cone` | `fx`, `delayPerTileMs?` | Una vez por casilla afectada, con retardo según la distancia al lanzador |
| `burst` | `beadFx`, `fx`, `tilesPerSec?` | La cuenta vuela al objetivo y allí estalla `fx` |
| `ring` | `fx`, `extraFx?` | Centrado en el lanzador |

## Efectos nuevos de *Willy* (`props` de `assets/ninja/extra.png`)

| Id | Uso |
|---|---|
| `fx-bombona-volando` | Bombona que gira por el aire (proyectil de *Lanzar bombona*) |
| `fx-explosion-bombona` | Estallido de 48×48 con núcleo azul de gas, bola naranja, esquirlas y la válvula saliendo despedida |
| `fx-mate-impacto` | Onda en el suelo con polvo y estrellas (32×16, a los pies): *Mate*, *Alley-oop* |
| `fx-papeleo` | Lluvia de impresos sobre el objetivo (16×24): *Vuelva usted mañana*, *Formulario por triplicado* |
| `fx-sello` | El sello baja, golpea y deja la marca roja: *Sello oficial* |
| `fx-chispazo` | Chispazos en el objetivo al final del *Arco voltaico* |

Vista previa de todos los efectos de *Willy*: [`art-previews/ninja-ability-fx.png`](art-previews/ninja-ability-fx.png).

## Animaciones de acción de *Willy* (`actions.json`)

Las mismas `attack`, `cast` y `hurt` que en *Intereses* (ver «Animaciones de acción»), derivadas con `build-action-anims.ts` para las 9 clases de Willy, los 8 compañeros, Chencho, los enemigos de la Planta 1 (`gaviota-de-lonja`, `rata-portuaria`, `cangrejo-con-casco`, `bocarte-andante`, `mimico`) y los jefes (`jefe-centollo`, `jefe-encargada`, `jefe-giganton`, `jefe-socorrista`, `jefe-presentador`). Sus frames pasan a `assets/ninja/actors.png`. Vista previa: [`art-previews/ninja-actions.png`](art-previews/ninja-actions.png).

# Legibilidad de los mapas: qué se pisa y qué no (*Intereses*)

Tres cambios para que se distinga a tamaño de móvil, sumados al tinte y al borde negro que el cliente ya pone en las casillas bloqueadas:

1. **Tejados** (`house`, `house_plain`): teja árabe de barro (`roof_clay_1/2`) en lugar de pizarra oscura, que se confundía con el suelo. Llevan **alero** como `rim` (`rim_eaves`): remates redondos de teja, sofito oscuro y la sombra sobre la fachada de entramado.
2. **Muros y roca maciza** (`wall`, `stone_wall`): sillares grandes y oscuros con una trama diagonal tenue. Ya no repiten en cada casilla el borde de ladrillo iluminado, que convertía las masas de muro en un suelo a rayas.
3. **Escalones** (nuevo campo `stair` del terreno): la cara que se dibuja en lugar de `face` cuando una casilla transitable está un nivel por encima de otra transitable al sur. Tiene huellas cada 3 filas (dos peldaños por nivel), así que no se confunde con un muro. Hay cuatro tipos:
   - `stair_stone`: `stone`, `cobble`, `vault`, `rails*` y `door_open`.
   - `stair_wood`: `planks` y `scaffold`.
   - `stair_earth`: con travesaños de troncos, para `road*`, `mud`, `scrub`, `dirt`, `riverbank*` y `slag_heap`.
   - `stair_rock`: `rock` y `slag`.

   **Petición al cliente:** en `buildWorld`, si la casilla es escalón y `art.stair` existe, usar ese frame en el `tileSprite` de la cara en lugar de `art.face` y no dibujar las líneas de huella. Hay que añadir `stair?: number` al tipo del terreno en `src/assets/manifest.ts`.

Antes y después, simulando el render del cliente: `art-previews/0x72-<mapa>-legibilidad.png` para `camino`, `plaza`, `abadia`, `calles`, `escorial`, `mina` y `boveda`, y la puerta del barón en la plaza a 4×: [`art-previews/0x72-plaza-puerta-baron-legibilidad.png`](art-previews/0x72-plaza-puerta-baron-legibilidad.png).

# Marcadores de salida (las dos partidas)

`exit_open` (4 frames, 6 fps, en bucle: dos galones que avanzan hacia el borde; dorado en *Intereses*, cian en *Willy*) y `exit_closed` (fijo: un galón apagado tras una barra). Mismo id en los dos manifiestos, `anchor: 'centre'`. Miran a la derecha: el cliente los gira hacia el borde del mapa por el que sale la salida. Vista previa: [`art-previews/exit-markers.png`](art-previews/exit-markers.png).

## Legibilidad de los mapas de *Willy* (Camerino y plantas generadas)

Mismo criterio que en *Intereses*:

- **Remates de muro sin franjas.** `plato_muro_techo` (muro del plató, también en el Camerino) es casi negro con la trama diagonal de «macizo». Antes eran franjas moradas que se confundían con el suelo oscuro del plató. `nieve_techo_1/2` (muros del balneario) es nieve con la misma trama, sin el borde por casilla que rayaba las masas de muro como un enlosado. Tejados del Castro y de la verbena, y baldas del híper, se quedan como están: ya se leen.
- **Escalones** (`stair`, que el cliente ya usa):
  - `escalon_piedra`: `piedra-mojada`, `soportal`, `verbena` y `muelle`.
  - `escalon_madera`: `tarima` y `escenario`.
  - `escalon_baldosa`: `lonja`, `hiper*`, `azulejo`, `hielo-balneario` y `cinta`.
  - `escalon_plato`: `plato`, `moqueta` y `baldosa-*`, con el canto en neón cian.

Antes y después (Camerino y las cinco plantas generadas con la semilla 7, esquina noroeste): `art-previews/ninja-camerino-legibilidad.png` y `art-previews/ninja-planta-<n>-legibilidad.png`.

# Coberturas, alturas y bestias para los combates (*Intereses*)

Los dibuja `scripts/art/cover-props.ts` con la paleta de 0x72. Cada uno lleva contorno oscuro y sombra de contacto en el suelo, para leerse como obstáculo a tamaño de móvil. Son `props` con `anchor: 'floor'` (la base en la fila inferior de la imagen); en el mapa se ponen como spawn `<id>-<n>`. Vista previa junto al Cobrador: [`art-previews/0x72-cover-props.png`](art-previews/0x72-cover-props.png).

| Id | Tamaño | Qué es |
|---|---|---|
| `cart`, `cart_sacks` | 32×16 | Carro de dos ruedas con heno / con sacos |
| `market_stall` | 16×24 | Puesto con toldo a rayas y mercancía |
| `sacks` | 16×16 | Tres sacos de arpillera oscura apilados |
| `rubble_pile`, `rubble_pile_b`, `rubble_pile_c` | 16×16 | Montón de cascotes sobre un túmulo de argamasa |
| `pillar_broken` | 16×24 | Fuste estriado partido con un tambor caído |
| `dead_tree`, `dead_tree_b`, `dead_tree_c` | 24×32 | Árbol seco: copa a la izquierda, a la derecha, o tronco tronchado |
| `ore_pile` | 16×16 | Roca oscura con vetas de cobre y plata |
| `tombstone` | 16×16 | Lápida con cruz y malas hierbas |
| `sarcophagus` | 16×24 | Sarcófago con efigie, visto desde arriba con su cara frontal |

Terrenos nuevos (`tiles.json`):

- `low_wall`: muro bajo de piedra, para altura 1 y **no transitable**, con albardilla de piedras grandes y cara de mampostería.
- `balcony`: tablones transitables con barandilla como `rim` (postes, pasamanos y sombra), cara de vigas con jabalcones y `stair` de madera.

Bestias (`hand-sprites.json`, `idle`/`move`/`hit`, mirando a la derecha; los retratos de 32×32 se generan solos): `perro` (perro carroñero pardo y sarnoso, 16×14), `lobo` (gris oscuro con hocico claro, 16×14) y `rata` (rata gigante gris con cola rosa, 16×10). Vista previa: [`art-previews/0x72-beasts.png`](art-previews/0x72-beasts.png).
