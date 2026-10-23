# Arte pendiente

Preset por defecto: **0x72** (ver `docs/ART_OPTIONS.md`). Catálogo de ids y peticiones al render: `docs/ART_CATALOG.md`. Lo marcado como *placeholder* se dibuja por código o con un tile provisional.

## Pendiente

| Pendiente | Juego | Situación actual | Qué hace falta |
|---|---|---|---|
| Exteriores: atrezo | intereses | Terrenos de exterior hechos (`road`, `scrub`, `mud`, `rock`, `cobble`, `house`, `stone_wall`, `fence`, `river`, `slag_heap`) | Árboles muertos, carros, pozos y puertas de casa como props si los mapas los piden; transiciones hechas (`blend`); añadir más parejas si hace falta |
| Llamas de antorcha en el juego | intereses | **Arte hecho** (`torch_wall`, `brazier`); el render aún usa la llama por código de `src/fx/LightingLayer.ts` | Petición al render n.º 1 en `docs/ART_CATALOG.md` |
| Reborde de plataformas | intereses | Horneado en las caras (`*_face` con reborde) y `rim_*` sueltos | Petición al render n.º 4 para dibujarlo una sola vez |
| Sangre, chispas y polvo como sprites | intereses | **Arte hecho** (`blood_1..3`, `fx_hit_spark`, `fx_dust`); `juice.ts` usa cuadrados por código | Peticiones al render n.º 2 y 3 |
| Animaciones de ataque, golpe y muerte (0x72) | intereses | No existen en el pack | Por código (`src/fx/`) |
| Terreno `scaffold` en los mapas | intereses | Arte y manifiesto listos | Tile lógico en `content/intereses/maps/terrain-logic.png` (sesión principal) |
| Reproductor de cinemáticas | intereses, willy | **Hecho** (`src/ui/cinematicPlayer.ts`): *Willy* lo reproduce tras «Nueva partida» y desde «Ver el prólogo». Falta enchufar el de *Intereses* (`GameDefinition.cinematics.intro`; ya tiene viñetas e `intro.json`) | Decidir dónde va el prólogo de *Intereses* frente a sus páginas de texto de `GameDefinition.intro`. La viñeta 12 de *Willy* dibuja cinco plantas apiladas: el texto ya dice diez (cinco biomas, dos plantas cada uno); retocar el dibujo si estorba |
| Superficies, barriles y explosión en el juego | intereses | **Arte hecho** (`surfaces`, `barrel`, `barrel_oil`, `crate`, `fx_explosion`, `fx_steam`) | Peticiones al render n.º 8 a 10 en `docs/ART_CATALOG.md`; bordes por vecinos (n.º 11) solo si hacen falta |
| *Willy*: resto del encargo P1 | willy | **P1 hecho**: Willy en 9 clases, PNJ del Camerino, enemigos de la Planta 1, cajas de botín, terrenos de Castro Sumergido y del Camerino, mobiliario y marcos de carta | Revisión con mapas reales; que el render dibuje props grandes, `ui` 9-slice y la caja legendaria flotando |
| *Willy*: P3 | willy | **P2 hecho**: invocaciones, utilería, superficies, efectos, retratos de patrocinadores e iconos | Hecho: rivales modulares, el Presentador y su plató, jefes y enemigos de todas las plantas. y terrenos de las Plantas 2-5. Atrezo de bioma de las Plantas 2-5 hecho. Falta: variante m/f de los rivales si se pide |
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
| Garrán y el Cobrador al estilo de 0x72 | intereses | `orc_warrior` y `doc` retocados frame a frame: moño, hombreras y pico; capucha, bufanda, ojos fríos, sello y farol |
| Retratos del grupo a 48×48 | intereses | Cobrador, Garrán, Dorotea y Anselmo pintados con cara propia (`portrait-painter.ts`) |
| Retratos de PNJ a 48×48 | intereses, willy | Mazo, Hilda, Nella, Odda, Cirilo, Lisandro, Brea, Ivo y Remedios; Paco, Koldo, Maripuri, Xelda y el Presentador, con el kit `bust-kit.ts` |
| Pantallas de título | intereses, willy | 320×180 en `assets/title/title.png` (`build-cinematics.ts <juego> title`); falta que el cliente las muestre |
| Efectos de conjuros | intereses | 18 efectos en `spell-fx.ts` (proyectiles, impactos, rayo, cono, anillos, auras); falta que el cliente los reproduzca según `ART_CATALOG.md` |
| Animaciones de ataque, lanzamiento y daño | intereses | Derivadas del idle (`build-action-anims.ts`) para el grupo y los enemigos principales; mejorables a mano frame a frame si se piden |
| Fuentes de luz y palanca | intereses | `candles`, `oil_lamp`, `lantern` y palanca nueva; falta que los mapas pongan `prop` en sus luces |
| Compañeros de *Willy* | willy | Nueve compañeros (uno por clase) con sprite y busto de 48×48; sin animaciones de ataque propias (usan las de efectos existentes) |
| Combate de *Willy* | willy | `attack`/`cast`/`hurt` derivadas para clases, compañeros, Planta 1 y jefes; seis efectos nuevos y tabla `fx` en el manifiesto; falta que el cliente lea `manifest.fx` |
| Legibilidad de los mapas | intereses, willy | Tejados de teja con alero, muros macizos con trama, caras de escalón (`stair`) en las dos partidas, marcadores de salida |
| Coberturas y bestias de combate | intereses | 14 props de cobertura, terrenos `low_wall` y `balcony`, bestias `perro`, `lobo` y `rata`; falta darlos de alta en `ART_PROPS` (world.ts) y colocarlos |
| Inventario y cajas de *Willy* | willy | Iconos de los 108 objetos (96 + los 12 nuevos de la meta: gaseosas, chatarra de patrocinador, granadas...), medallas por categoría de logro, marcos de rareza y cajas de apertura de 64×64 |
| Enemigos nuevos de *Willy* | willy | 21 enemigos + élites dorados y `aura-elite`, efectos de sus 18 habilidades (tabla `fx`) y arte del derrumbe (`grieta`, `hundido`, `fx-polvo-derrumbe`, `fx-cascotes`) hechos |
| Élites de los enemigos antiguos de *Willy* | willy | Recolor dorado `<id>--elite` para los 20 enemigos de las 5 plantas que no venían de la tanda de 21 nuevos; `mimico` y los jefes de planta se quedan fuera (el mímico ya es un tipo élite y nunca sale sorteado como élite; los jefes son únicos) |
| FX de clases, compañeros y rivales | willy | Auditoría completa de `fx.json` contra `rulesets/willy/data` (clases, básicas, compañeros) y `rival-generator.json`; faltaban 66+9, todas hechas con props reutilizados o 7 props genéricos nuevos. Las pasivas y de movimiento puro se quedan sin FX a propósito |
| Caja legendaria con estrellas | willy | `caja-legendaria-estrellas` (64×64, capa de fondo con resplandor y estrellas), a petición del agente de la meta para la apertura de cajas |
| Aviso de «¡ELIMINADO!» | willy | `fx_eliminado` (112×24, banderola roja y oro con el texto horneado), a petición del agente del cliente para `onDeath: 'vanish'`; sustituye el texto flotante si el cliente lo usa, con fallback si no |
| Cadáveres | intereses | 7 tipos derivados del idle y mapa `corpses` en el manifiesto; falta que el cliente los use |
| Pulido del HUD | intereses | Barra superior en una fila, fichas de iniciativa con retrato, barra de acciones en dos filas, botones de 44 px, paneles de hierro biselado |
| Objetos interactivos (Fase 4) | intereses | `chest`, `chest_trapped`, `lever`, terrenos `door_closed`/`door_open`, props `trap_armed`/`trap_disarmed` |
| PNJ de Hondonegra | intereses | `mazo`, `hilda`, `cirilo`, `fanatico_pala`, `nella`, `odda`, `lisandro`, aldeanos; atrezo `tapestry`, `tapestry_crossbow`, `gallows` |
| Calles y Escorial | intereses | `fiel_pala`, `viuda`; `campfire`, `oil_cart`, `well`; trampas `trap_beartrap`, `trap_tripwire`, `trap_dart` |
| Mina y Bóveda | intereses | Terrenos `rails`, `rails_v`, `vault`; `mine_wagon`, `mine_wagon_ore`, `powder_keg`, `resonator`; `fuse_charges`, `remains_forty`, `pulley`, `inscription`, `trap_rotten_plank`; `ivo` |
