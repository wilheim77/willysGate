# Catálogo de audio

Candidatos de música y efectos para *Intereses* y *Willy el mazmorrero*, pensados para `src/audio/` (ver `docs/DESIGN.md` → «Efectos y ambiente») y los manifiestos `content/<juego>/assets/audio.json`.

**Regla dura: nada se descarga todavía.** Esta tabla es la propuesta. Solo CC0 (preferido) o CC-BY con página de licencia verificable; nada con licencia dudosa o "royalty-free" sin texto de licencia claro. Formato de destino: **OGG**, convertido/recortado con `ffmpeg` si hace falta. Presupuesto por juego: **~10 MB** en total (música + sfx).

## Packs base (cubren la mayoría de SFX)

| Pack | Autor | Licencia | URL | Contenido relevante | Tamaño aprox. |
|---|---|---|---|---|---|
| Kenney RPG Audio | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio | 50 efectos de fantasía: puertas (`doorOpen`/`doorClose`), cuchillo/espada, pasos, cerraduras (`metalClick`, `metalLatch`) — candidato para `doorOpen`, `leverPull`, `trapClick` | ~2-3 MB el pack completo (.ogg) |
| Kenney Impact Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds | 130 impactos: metal, piedra, pasos — candidato para `hitBlunt`, `hitSlash`, `hitPierce`, `footstepStone`, `barrelBreak`, `explosion` (impacto pesado) | ~3-4 MB el pack completo |
| Kenney Interface Sounds / UI Audio | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds · https://kenney.nl/assets/ui-audio | Clics, confirmaciones, errores — candidato directo para `uiClick`, `uiConfirm`, `uiCancel` | <1 MB para los 3-4 que usamos |
| Kenney Casino Audio | Kenney | CC0 1.0 | https://kenney.nl/assets/casino-audio | 12 sonidos de dados (`diceThrow1-4`, `dieGrab`, `dieShuffle`) — candidato exacto para `diceRoll` | <0.5 MB |
| Kenney Music Jingles | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles | Stingers cortos (victoria/derrota, fanfarrias) — candidato para `victory`/`defeat` y el `tvJingle` de *Willy* | <1 MB para 2-3 jingles |
| OpenGameArt "50 RPG sound effects" | varios (ver página) | CC0 (verificar cada autor en la página) | https://opengameart.org/content/50-rpg-sound-effects | Complemento de Kenney RPG Audio: bola de fuego, rayo, hielo — candidato para `spellFire`/`spellCold`/`spellLightning` si Kenney no alcanza | variable, pedir individual |

Con estos tres o cuatro packs de Kenney (todos CC0, sin atribución obligatoria aunque la pondremos en `CREDITS.md` igualmente) cubrimos casi toda la lista de SFX genéricos con un tamaño total pequeño, eligiendo solo los ficheros concretos que necesitamos (no el pack entero) al convertir.

## Música (pistas largas, candidatos individuales)

Los packs de Kenney no traen música de fondo completa; estas son pistas sueltas de OpenGameArt, todas con bucle:

| Uso | Candidato | Autor | Licencia | URL | Duración/tamaño aprox. |
|---|---|---|---|---|---|
| `exploration` (mazmorra/mina) | Loopable Dungeon Ambience | ver página (CC0) | CC0 | https://opengameart.org/content/loopable-dungeon-ambience | ~1-2 min loop, ~1-2 MB en ogg a bitrate bajo |
| `exploration` (alternativa, más melódica) | Dungeon Ambience | ver página (CC0) | CC0 | https://opengameart.org/content/dungeon-ambience | similar |
| `combat` | Fast fight / battle music (looped) | Ville Nousiainen | CC0 | https://opengameart.org/content/fast-fight-battle-music-looped | ~1-2 MB |
| `combat` (alternativa) | Battle Theme A | ver página (CC0) | CC0 | https://opengameart.org/content/battle-theme-a | similar |
| `tension` | Dark Cavern Ambient | ver página (CC0) | CC0 | https://opengameart.org/content/dark-cavern-ambient | ~1 MB |
| `title` | Short Loops Background Music Pack (elegir una pista lenta) | ver página | CC0 | https://opengameart.org/content/short-loops-background-music-pack | <1 MB por pista |
| `victory` / `defeat` | Kenney Music Jingles (stinger corto, no bucle) | Kenney | CC0 | https://kenney.nl/assets/music-jingles | <0.3 MB cada uno |

**Nota de verificación:** cada página de OpenGameArt lista la licencia de cada fichero individualmente (algunas colecciones mezclan CC0 y CC-BY de distintos autores dentro del mismo pack); al descargar hay que comprobar la licencia exacta del fichero elegido, no solo el título de la colección, y copiar el texto de atribución si es CC-BY.

## Extras de *Willy* (ambiente de concurso de TV + costa)

| Sonido | Candidato | Autor | Licencia | URL | Tamaño aprox. |
|---|---|---|---|---|---|
| `crowdApplause` | Small applause | Breviceps | CC0 | https://freesound.org/people/Breviceps/sounds/462362/ | corto, <0.3 MB |
| `crowdApplause` (alternativa, más grande) | Large crowd applause.wav | Bansemer | CC0 | https://freesound.org/people/Bansemer/sounds/160493/ | recortar a ~2-3 s |
| `crowdBoo` | Crowd Boo.wav | usuario eliminado (Freesound id 324893) | CC0 | https://freesound.org/people/deleted_user_2104797/sounds/324893/ | <0.3 MB |
| `crowdBoo` (alternativa) | crowd booing | HowardV | CC0 | https://freesound.org/people/HowardV/sounds/264378/ | <0.3 MB |
| `tvJingle` | Kenney Music Jingles (stinger alegre) | Kenney | CC0 | https://kenney.nl/assets/music-jingles | <0.3 MB |
| `gameshowBuzzer` | Wrong Buzzer | KevinVG207 | CC0 | https://freesound.org/people/KevinVG207/sounds/331912/ | <0.1 MB |
| `gameshowBuzzer` (alternativa) | Buzzer sounds (Wrong answer / Error) | Breviceps | CC0 | https://freesound.org/people/Breviceps/sounds/493163/ | <0.1 MB |
| `gameshowDing` | buscar en el mismo pack de Interface Sounds de Kenney (tono de confirmación agudo) | Kenney | CC0 | https://kenney.nl/assets/interface-sounds | <0.1 MB |
| `gulls` | seagull.wav | speakingmusic | CC0 | https://freesound.org/people/speakingmusic/sounds/586831/ | <0.5 MB |
| `gulls` (alternativa, varios individuales) | Solo Seagull Sound Effects | ver página (CC0) | CC0 | https://opengameart.org/content/solo-seagull-sound-effects | variable |
| `sea` | Ocean Waves.wav | Noted451 | CC0 | https://freesound.org/people/Noted451/sounds/531015/ | recortar un bucle de ~10-20 s, <1 MB |
| `sea` (alternativa) | Gentle Waves - Quiet Beach | amholma | CC0 | https://freesound.org/people/amholma/sounds/376795/ | similar |

## Catálogo completo por id de sonido (resumen de a dónde apunta cada uno)

| Id (`sfx`/`music` en `audio.json`) | Juego(s) | Fuente propuesta |
|---|---|---|
| `title`, `exploration`, `combat`, `tension`, `victory`, `defeat` | ambos | ver tabla "Música" |
| `footstepStone`, `footstepDirt` | ambos | Kenney Impact Sounds (pasos de piedra/tierra) |
| `hitSlash`, `hitPierce`, `hitBlunt` | ambos | Kenney Impact Sounds / RPG Audio |
| `miss` | ambos | Kenney RPG Audio (swish) |
| `bowShot` | ambos | Kenney RPG Audio |
| `spellFire`, `spellCold`, `spellLightning`, `spellThunder`, `spellRadiant` | ambos | OpenGameArt "50 RPG sound effects" |
| `explosion` | ambos | Kenney Impact Sounds |
| `barrelBreak` | ambos | Kenney Impact Sounds (madera) |
| `surfaceIgnite`, `surfaceFreeze`, `surfaceSteam` | ambos | Kenney Impact/RPG Audio (fuego prendiendo, hielo crujiendo, vapor) — pendiente de buscar fichero exacto |
| `doorOpen`, `chestOpen`, `leverPull` | ambos | Kenney RPG Audio |
| `trapClick`, `trapSpring` | ambos | Kenney RPG Audio / Interface Sounds |
| `diceRoll` | ambos | Kenney Casino Audio |
| `uiClick`, `uiConfirm`, `uiCancel` | ambos | Kenney Interface Sounds / UI Audio |
| `levelUp` | ambos | Kenney Music Jingles (stinger corto) |
| `crowdApplause`, `crowdBoo`, `tvJingle`, `gameshowBuzzer`, `gameshowDing`, `gulls`, `sea` | *Willy* | ver tabla "Extras de Willy" |

## Pendiente de aprobación

Antes de descargar nada: confirmar con el usuario (vía la sesión principal) que esta lista de candidatos y tamaños es aceptable. Una vez aprobado, el plan es:
1. Descargar solo los ficheros concretos elegidos (no packs enteros).
2. Convertir a OGG y recortar/normalizar volumen con `ffmpeg` si está disponible.
3. Guardar en `content/<juego>/public/assets/audio/{music,sfx}/`.
4. Registrar cada fichero en `CREDITS.md` (título, autor, URL, licencia) siguiendo el formato ya usado para el arte.
5. Vigilar el presupuesto de ~10 MB por juego; si algo pesa de más, usar una versión más corta o un bitrate menor.
