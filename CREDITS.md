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
| Ninja Adventure Asset Pack (selección: `TilesetFloor`, `TilesetRelief`) | intereses / `0x72` | pixel-boy y AAA | CC0 1.0 | https://pixel-boy.itch.io/ninja-adventure-asset-pack | Suelos de exterior (tierra), recortados en el atlas de terreno. Caras de acantilado recoloreadas por luminancia a la paleta de 0x72 (`dirt_face`, `slag_face`, `rock_face`, `earth_face`). |
| Recolores de personajes 0x72 (`characters.png`) | intereses / `0x72` | Derivado de Robert (0x72); recolor del proyecto | CC0 1.0 | — | 15 personajes (compañeros, Sinpaga, guardias, Callados, Absalón, no muertos) recoloreados por `scripts/art/build-palette-variants.ts`; a Absalón se le quita el brote y se le añade un collar de plata. Detalles propios dibujados encima (farol, pico, libro de cuentas, crucifijo, cuchillo, sombrero con vela). Los retratos del HUD (`portraits.png`) se generan desde estos sprites con `scripts/art/build-portraits.ts`. Garrán y el Cobrador son `orc_warrior` y `doc` de 0x72 retocados frame a frame (`hand.png`, `scripts/art/build-hand-sprites.ts`) y los bustos de 48×48 del grupo (`portraits-hand.png`) están pintados por el proyecto con `scripts/art/portrait-painter.ts`; CC0. Ver `docs/ART_CATALOG.md`. |
| Arte propio generado (`extra.png`) | intereses / `0x72` | willysGate | CC0 1.0 | — | Tablones, andamios, remate de muro (con 4 filas de `wall_top_mid` de 0x72), rebordes, antorcha, brasero, sangre, chispa, polvo, superficies (aceite, grasa, fuego, agua, hielo, agua electrificada, sangre, cascajo), barriles, restos de barril y caja, explosión, vapor, efectos de conjuros (`spell-fx.ts`) y animaciones de acción derivadas de los sprites de 0x72 (`build-action-anims.ts`, `actors.png`), dibujados píxel a píxel por `scripts/art/build-extra-art.ts` y `environment-art.ts` con la paleta de 0x72. `crate` es la caja de 0x72 sin cambios. |
| Personajes de *Willy* (`content/willy/public/assets/ninja/characters.png`) | willy / `ninja` | willysGate | CC0 1.0 | — | Willy en sus 9 clases y los PNJ del Camerino (Paco, Koldo, Maripuri, Xelda), dibujados a mano como partes ASCII por `scripts/art/build-hand-sprites.ts`. |
| Mímico y cajas de botín de *Willy* (`chests.png`) | willy / `ninja` | Derivado de Robert (0x72); recolor del proyecto | CC0 1.0 | https://0x72.itch.io/dungeontileset-ii | `chest_mimic` y `chest_full` recoloreados por rareza con `scripts/art/build-palette-variants.ts`; la caja de bronce (cartón) y los enemigos de la Planta 1 están dibujados por el proyecto. |
| Terrenos, mobiliario del Camerino y marcos de carta de *Willy* (`extra.png`) | willy / `ninja` | willysGate | CC0 1.0 | — | Dibujados por `scripts/art/build-willy-art.ts` con paleta propia. |
| Utilería, atrezo de bioma, superficies, efectos, iconos y patrocinadores de *Willy* | willy / `ninja` | willysGate | CC0 1.0 | — | Dibujados por `scripts/art/willy-show-art.ts`, `build-willy-art.ts` y `portrait-painter.ts`; las superficies comunes y los barriles reutilizan el arte propio de *Intereses*. |
| Rivales modulares de *Willy* (`rivals.png`) | willy / `ninja` | willysGate | CC0 1.0 | — | Cuerpos por raza, paletas, accesorios y legendarios dibujados por el proyecto con `scripts/art/build-rivals.ts`. |
| Pantallas de título (`assets/title/title.png`) | intereses, willy | willysGate | CC0 1.0 | — | Compuestas por `scripts/art/build-cinematics.ts` desde `title.spec.json` con formas, la fuente 5×7 del proyecto y los sprites ASCII de la intro. |
| Viñetas del prólogo | intereses, willy | willysGate, con tiles y sprites de 0x72 y Ninja Adventure | CC0 1.0 | — | Compuestas por `scripts/art/build-cinematics.ts` con fondos procedurales y sprites ASCII propios (Willy, bombona, gaviota, dron…). |
| Universal LPC Spritesheet Character Generator (capas de personaje) | intereses / `lpc` | Varios: Stephen Challener (Redshrike), Johannes Sjölund (wulax), Matthew Krohn (makrohn), bluecarrot16, Benjamin K. Smith (BenCreating), Eliza Wyatt (ElizaWy), JaidynReiman, Evert, TheraHedwig, MuffinElZangano, Durrani, Manuel Riecke (MrBeast), Nila122. Detalle por capa en `content/intereses/public/assets/lpc/characters/CREDITS-characters.csv`. | CC-BY-SA 3.0 / GPL 3.0 (algunas capas también OGA-BY 3.0 o GPL 2.0) | https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator (commit `9bf06be`) | Capas combinadas y recoloreadas por paleta en una hoja por personaje. **La hoja derivada se publica como CC-BY-SA 3.0.** |
| LPC Tile Atlas | intereses / `lpc` | Varios artistas del Liberated Pixel Cup (lista completa en `art-src/lpc-tile-atlas/Attribution.txt`) | CC-BY-SA 3.0 / GPL 3.0 | https://opengameart.org/content/lpc-tile-atlas | Tiles de terreno recortados en un atlas. **El atlas derivado se publica como CC-BY-SA 3.0.** |

**Modificaciones en tiempo de ejecución:** todos los presets pasan por un filtro de color de cámara (saturación, brillo, tinte) y una capa de iluminación. No se modifican los ficheros.

**Licencia del arte derivado:** lo generado a partir de LPC (`content/*/public/assets/lpc/`) se distribuye bajo **CC-BY-SA 3.0** con la atribución anterior. El arte CC0 se puede usar sin condiciones. El código del proyecto es MIT (`LICENSE`).

## Audio

Catálogo de fuentes candidatas y su selección en `docs/AUDIO.md`. Todos los ficheros se recortaron/convirtieron a OGG y se normalizó el volumen con `ffmpeg`; ningún fichero se usa sin modificar salvo que se indique. Ficheros finales en `content/<juego>/public/assets/audio/{music,sfx,ambience}/`, manifiestos en `content/<juego>/assets/audio.json`.

| Fichero final | Juego(s) | Fuente | Autor | Licencia | URL |
|---|---|---|---|---|---|
| `music/exploration.ogg`, `music/title.ogg` (recortes distintos de la misma pista) | intereses, willy | Loopable Dungeon Ambience | JaggedStone | CC0 1.0 | https://opengameart.org/content/loopable-dungeon-ambience |
| `music/combat.ogg` | intereses, willy | Fast fight / battle music (looped) | XCVG | CC0 1.0 | https://opengameart.org/content/fast-fight-battle-music-looped |
| `music/tension.ogg` | intereses, willy | Dark Cavern Ambient | Paul Wortmann | CC0 1.0 | https://opengameart.org/content/dark-cavern-ambient |
| `music/victory.ogg` | intereses, willy | Music Jingles (Hit jingles, `jingles_HIT08`) | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles |
| `music/defeat.ogg` | intereses, willy | Music Jingles (8-Bit jingles, `jingles_NES10`) | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles |
| `sfx/footstep_stone_1/2.ogg`, `sfx/footstep_dirt_1/2.ogg` | intereses, willy | Impact Sounds (`footstep_concrete_*`, `footstep_grass_*`) | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `sfx/hit_blunt.ogg`, `sfx/spell_radiant.ogg`, `sfx/chest_open.ogg`, `sfx/lever_pull.ogg`, `sfx/trap_spring.ogg`, `sfx/explosion.ogg` (variante de volumen) | intereses, willy | 100 CC0 SFX (`hit_02`, `bell_02`, `wooded_box_open`, `switch_01`, `spring_03`, `explosion`) | rubberduck | CC0 1.0 | https://opengameart.org/content/100-cc0-sfx |
| `sfx/hit_slash.ogg`, `sfx/hit_pierce.ogg` (variante), `sfx/spell_fire.ogg`, `sfx/surface_ignite.ogg` (variante), `sfx/barrel_break.ogg` | intereses, willy | 80 CC0 RPG SFX (`blade_01`, `blade_03`, `spell_fire_03`, `spell_fire_01`, `wood_02`) | rubberduck | CC0 1.0 | https://opengameart.org/content/80-cc0-rpg-sfx |
| `sfx/door_open.ogg`, `sfx/trap_click.ogg` | intereses, willy | RPG Audio (`doorOpen_1`, `metalClick`) | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
| `sfx/miss_swish.ogg` | intereses, willy | Swishes Sound Pack (`swish-3`) | artisticdude | CC0 1.0 | https://opengameart.org/content/swishes-sound-pack |
| `sfx/bow_shot.ogg` | intereses, willy | Battle Sound Effects (`Bow`) | Ogrebane | **CC-BY 3.0** | https://opengameart.org/content/battle-sound-effects |
| `sfx/spell_cold.ogg`, `sfx/surface_freeze.ogg` (mismo origen, recortes distintos) | intereses, willy | Freeze Spell | artisticdude | CC0 1.0 | https://opengameart.org/content/freeze-spell-0 |
| `sfx/spell_lightning.ogg` | intereses, willy | Electricity Sound Effects (`spark`) | BMacZero | CC0 1.0 | https://opengameart.org/content/electricity-sound-effects-0 |
| `sfx/spell_thunder.ogg` (mismo origen que `explosion.ogg`, recortes distintos) | intereses, willy | Dynamite sound effect | Listener | CC0 1.0 | https://opengameart.org/content/dynamite-sound-effect |
| `sfx/surface_steam.ogg` | intereses, willy | Steam release sounds (`Marker #2`) | bart | CC0 1.0 | https://opengameart.org/content/steam-release-sounds |
| `sfx/dice_roll.ogg` | intereses, willy | Casino Audio (`dice-throw-2`) | Kenney | CC0 1.0 | https://kenney.nl/assets/casino-audio |
| `sfx/ui_click.ogg` | intereses, willy | UI Audio (`click3`) | Kenney | CC0 1.0 | https://kenney.nl/assets/ui-audio |
| `sfx/ui_confirm.ogg`, `sfx/ui_cancel.ogg`, `sfx/gameshow_ding.ogg` (willy) | intereses, willy | Interface Sounds (`confirmation_002`, `close_002`, `bong_001`) | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `sfx/level_up.ogg`, `sfx/tv_jingle.ogg` (willy) | intereses, willy | Music Jingles (Pizzicato `jingles_PIZZI10`, Sax `jingles_SAX05`) | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles |
| `sfx/crowd_applause.ogg` | willy | Small applause | Breviceps | CC0 1.0 | https://freesound.org/people/Breviceps/sounds/462362/ |
| `sfx/crowd_boo.ogg` | willy | Crowd Boo.wav | usuario de Freesound (cuenta eliminada, id 2104797) | CC0 1.0 | https://freesound.org/people/deleted_user_2104797/sounds/324893/ |
| `sfx/gameshow_buzzer.ogg` | willy | Wrong Buzzer | KevinVG207 | CC0 1.0 | https://freesound.org/people/KevinVG207/sounds/331912/ |
| `sfx/gulls.ogg` | willy | seagull.wav | speakingmusic | CC0 1.0 | https://freesound.org/people/speakingmusic/sounds/586831/ |
| `sfx/sea.ogg` | willy | Ocean Waves.wav | Noted451 | CC0 1.0 | https://freesound.org/people/Noted451/sounds/531015/ |
| `ambience/camino.ogg` (mezcla) | intereses | Wind1 + Crow caw | Luke.RUSTLTD; zeroisnotnull | CC0 1.0 | https://opengameart.org/content/wind1 ; https://opengameart.org/content/crow-caw |
| `ambience/plaza.ogg`, `ambience/calles.ogg` (mezcla con `dog_barking_mono`) | intereses | Crowd Shouting/Speaking Ambience | StarNinjas | CC0 1.0 | https://opengameart.org/content/crowd-shoutingspeaking-ambience |
| `ambience/calles.ogg` (capa de perro, mezcla) | intereses | Dog barking mono | HaelDB (sonidos de Brandon Morris) | **OGA-BY 3.0** | https://opengameart.org/content/dog-barking-mono |
| `ambience/abadia.ogg` (recorte distinto de `music/tension.ogg`) | intereses | Dark Cavern Ambient | Paul Wortmann | CC0 1.0 | https://opengameart.org/content/dark-cavern-ambient |
| `ambience/mina.ogg` (recorte distinto de `music/exploration.ogg`) | intereses | Loopable Dungeon Ambience | JaggedStone | CC0 1.0 | https://opengameart.org/content/loopable-dungeon-ambience |
| `ambience/escorial.ogg` (mezcla con `impactMining_001/003`) | intereses | Wind1; Impact Sounds (`impactMining`) | Luke.RUSTLTD; Kenney | CC0 1.0 | https://opengameart.org/content/wind1 ; https://kenney.nl/assets/impact-sounds |
| `ambience/boveda.ogg` | intereses | Dark Ambience Loop | qubodup (Iwan Gabovitch) | **CC-BY 3.0** | https://opengameart.org/content/dark-ambience-loop |
| `music/boveda/combat.ogg` | intereses | Hard Boss Battle 1 | MintoDog | CC0 1.0 | https://opengameart.org/content/hard-boss-battle-1 |
| `ambience/camerino.ogg` | willy | Ambience Pack 1 -- Sci Fi Horror (`Infestation in the Control Room`) | Joth | CC0 1.0 | https://opengameart.org/content/ambience-pack-1-sci-fi-horror |
| `ambience/planta-1.ogg` (mezcla) | willy | Ocean Waves.wav + seagull.wav (reutilizados de `sfx/sea.ogg`/`sfx/gulls.ogg`) | Noted451; speakingmusic | CC0 1.0 | https://freesound.org/people/Noted451/sounds/531015/ ; https://freesound.org/people/speakingmusic/sounds/586831/ |
| `sfx/crit_hit.ogg`, `sfx/downed_thud.ogg`, `sfx/death_toll.ogg` | intereses, willy | Impact Sounds (`impactPunch_heavy_001`, `impactSoft_heavy_003`, `impactBell_heavy_002`) | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `sfx/map_whoosh.ogg` | intereses, willy | Swishes Sound Pack (`swish-7`) | artisticdude | CC0 1.0 | https://opengameart.org/content/swishes-sound-pack |
| `ambience/planta-2.ogg` | willy | Shop Theme (`Buy Something! (Radio Edit)`) | CleytonKauffman | CC0 1.0 | https://opengameart.org/content/shop-theme |
| `ambience/planta-3.ogg` | willy | Children's March Theme | CleytonKauffman | CC0 1.0 | https://opengameart.org/content/childrens-march-theme |
| `ambience/planta-4.ogg` (con eco añadido) | willy | Dripping water loop | Independent.nu, enviado por qubodup | CC0 1.0 | https://opengameart.org/content/dripping-water-loop |
| `ambience/planta-5.ogg` (copia exacta de `ambience/plaza.ogg` de *Intereses*, mismo público de fondo) | willy | Crowd Shouting/Speaking Ambience | StarNinjas | CC0 1.0 | https://opengameart.org/content/crowd-shoutingspeaking-ambience |
| `music/planta-5/combat.ogg` | willy | Bouncy Hamster Dancing (Menu Music?) | cynicmusic | CC0 1.0 | https://opengameart.org/content/bouncy-hamster-dancing-menu-music |

**Atribución obligatoria:** `sfx/bow_shot.ogg` (Ogrebane, "Battle Sound Effects", CC-BY 3.0), `ambience/boveda.ogg` (qubodup / Iwan Gabovitch, "Dark Ambience Loop", CC-BY 3.0: https://creativecommons.org/licenses/by/3.0/) y la capa de perro de `ambience/calles.ogg` (HaelDB, "Dog barking mono", OGA-BY 3.0: http://opengameart.org/content/oga-by-30-faq). El resto de audio es CC0 1.0 (sin condiciones), pero se atribuye igualmente aquí por buena práctica.
