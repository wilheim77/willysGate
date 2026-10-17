# Willy el mazmorrero: progreso

> Rama: `willy`. Se trabaja en paralelo con la sesión principal (motor e *Intereses*), sin tocar código compartido.

## Estado actual

- **Fase W0, Diseño:** **completada y aprobada con cambios** (2026-10-17). Ver «Decisiones del usuario».
- La premisa la definió el usuario: concurso galáctico retransmitido, 5 plantas con reloj, cásting LitRPG, audiencia, patrocinadores, cajas de botín, logros y Narrador.
- No hay código del juego todavía (ni `game.ts` ni `rulesets/willy/`), a propósito: el build intentaría desplegarlo.

## Hecho (W0)

| Entregable | Dónde |
|---|---|
| Historia, personajes, patrocinadores, plantas y finales | [`STORY.md`](STORY.md) |
| Guion del prólogo (16 viñetas, 1:48), ya ilustrado por la sesión de arte | [`INTRO.md`](INTRO.md) · `content/willy/cinematics/` (rama de arte, ya en `main`) |
| Reglamento d20 propio (atributos visibles, niveles frecuentes, habilidades que suben con el uso) | [`RULESET.md`](RULESET.md) |
| Diseño completo: procedural, reloj, audiencia, patrocinadores, cajas, logros, Narrador, Camerino, onboarding, arte, fases | [`DESIGN.md`](DESIGN.md) |
| Peticiones al motor y al cliente (R1-R15) | [`ENGINE_REQUESTS.md`](ENGINE_REQUESTS.md) |
| 6 razas y 9 clases, incluidas las especiales Ingeniero, Funcionario y Jugador de basket (57 habilidades y mazo de ventajas) | `content/willy/data/races.json`, `classes.json` |
| 93 objetos (27 iniciales de clase, 66 de botín, avisos y cosméticos) | `content/willy/data/items.json` |
| Cajas, tablas de botín, piedad, cofres, botín de enemigos y mercado | `content/willy/data/loot-tables.json` |
| 124 logros (23 ocultos) con frase del Narrador y recompensa | `content/willy/data/achievements.json` |
| 6 patrocinadores con gustos, regalos y mensajes | `content/willy/data/sponsors.json` |
| Reglas de audiencia | `content/willy/data/audience.json` |
| 5 plantas (bioma, mecánica, reloj, generación, enemigos, jefe) y el Camerino | `content/willy/data/floors.json` |
| Tutorial integrado de la Planta 1 (28 pasos) | `content/willy/tutorial.json` |
| Glosario y «Cómo se juega» | `content/willy/texts/` |
| Narrador: 376 frases en 59 bancos | `content/willy/narrator/` |
| Metadatos para la portada | `content/willy/meta.json` |

## Decisiones del usuario (2026-10-17)

W0 **aprobada** con estos cambios, ya aplicados en los documentos y los datos:

| # | Tema | Decisión | Dónde se refleja |
|---|---|---|---|
| 1 | Reloj de planta | Aprobado tal cual: reloj de acciones (1 s por casilla, 15 s por ronda, 3 s por interacción); el derrumbe baja a Willy a la planta siguiente con −30 % de vida | `DESIGN.md` §4 |
| 2 | Eliminación | Se elige al empezar: **Con repetición** (normal: vuelta al último Camerino y la planta se regenera) o **Sin repetición** (hardcore: muerte permanente, una sola ranura con autoguardado, sin poder recargar) | `DESIGN.md` §12, `RULESET.md`, logros «Una sola toma» y «Programa cancelado», bancos del Narrador `inicioSinRepeticion` y `willyEliminadoSinRepeticion`, `ENGINE_REQUESTS.md` R9 |
| 3 | Entre partidas | Solo variedad (objetos en las tablas, cosméticos), nunca poder permanente | `DESIGN.md` §12 |
| 4 | Razas y clases | Se quedan las 12 y se añade la clase especial **Ingeniero de 5G** (para un amigo del usuario; renombrada «Ingeniero» en la decisión 11): autómatas, antena-torreta y rayos 5G; desventaja «Cobertura irregular» | `classes.json`, 3 objetos iniciales y 2 cosméticos en `items.json`, 7 logros (categoría «Ingeniero de 5G»), 4 bancos del Narrador, `RULESET.md`, `STORY.md`, R13 ampliada (invocaciones) |
| 5 | Final | Los tres: el jugador elige A o B; C (secreto) aparece si se cumplen sus condiciones | `STORY.md` §4, logros ocultos `final-a`, `final-b`, `final-c` |
| 6 | Fuente | Las dos: **Press Start 2P** para títulos y rótulos del programa; **VT323** para diálogos y Narrador | `DESIGN.md` §13 y §15, R9 (`titleFontFamily`) |
| 7 | Feedback | **Sin botón por ahora.** No se publica correo ni formulario. TODO para el futuro (`feedbackUrl` opcional) | `DESIGN.md` §13 y §15, R9 |
| 8 | Arte | **No se compra arte** (ni LimeZu ni ningún otro). Ninja Adventure + 0x72 + Kenney + arte propio de la sesión de arte | `DESIGN.md` §14 |

### Segunda ronda (2026-10-17)

| # | Tema | Decisión | Dónde se refleja |
|---|---|---|---|
| 9 | Nueva clase **Funcionario** | Lanza papeleo que aturde («Vuelva usted mañana»), expedientes como superficie que enreda y arde, Pausa del café que cura, Sello oficial, Ventanilla cerrada (barrera), Silencio administrativo. Pasiva: nadie lo mueve de su plaza. Desventaja: horario de atención al público. La sátira es sobre la burocracia, no sobre quien trabaja en ella | `classes.json`, 3 objetos iniciales y 2 cosméticos, 7 logros (categoría «Funcionario»), 6 bancos del Narrador, glosario (expedientes, compulsado), `RULESET.md` |
| 10 | Nueva clase **Jugador de basket** | Gran salto (cruza huecos, sube 2 niveles), Mate desde arriba (Tumbado y empujón), Pase picado con rebote que ignora cobertura, Tiempo muerto (invoca a Chencho, el base), Alley-oop, Mate del concurso. Desventaja: tira a canasta a cualquier cosa redonda y no puede saltar en salas de techo bajo | `classes.json`, 3 objetos iniciales y 2 cosméticos, etiqueta `redondo` en bombona, balón, patito, cabezudo y Centollo, 8 logros (categoría «Jugador de basket»), 6 bancos del Narrador, **R15** (salto y rebote) |
| 11 | **Ingeniero** (antes «Ingeniero de 5G») | El 5G pasa a ser una de sus habilidades, ~~secreta hasta el primer uso~~ **visible desde el principio** (corrección 12); a nivel 5G no hace nada (el Narrador: «¡Ya sabíamos que el 5G no servía para nada! A lo mejor si lo subes a 6G…»); sube con el uso a 6G, 7G, 8G, 9G y 10G (umbrales 3/7/12/18/25 usos), cada nivel hace algo real y 10G es absurdamente poderoso. Su ataque a distancia pasa a ser «Arco voltaico». Chistes siempre contra los conspiranoicos, nunca contra él | `classes.json` (`red-g`), 7 logros nuevos o renombrados («¿Y esto qué hace?», «Fe en la tecnología», 6G-9G, «Cobertura total: 10G»; el de 3 autómatas pasa a «Subcontrata»), bancos `redG` y `redGSubeNivel`, `RULESET.md`, `STORY.md`, `DESIGN.md`, R13 |

| 12 | Corrección del 5G | **No es secreto:** se ve como «5G» desde el principio para tentar al jugador. El chiste del Narrador sale solo en el primer uso; los siguientes usos a 5G no hacen nada y casi siempre en silencio (banco mínimo `redG5Repetido`, sin repeticiones). Se quita la mecánica «??? (sin estrenar)»; se mantienen los nombres por nivel. El logro «¿Y esto qué hace?» deja de ser oculto | `classes.json`, `miscelanea.json`, `achievements.json`, `RULESET.md`, `STORY.md` |

**Cifras tras los cambios:** 6 razas, 9 clases (57 habilidades), 93 objetos, 124 logros (23 ocultos), 376 frases del Narrador en 59 bancos.

## Pendiente

- Nada de diseño pendiente de aprobación. Quedan las decisiones de detalle que salgan al implementar cada fase.
- TODO: botón de feedback, si el usuario lo quiere más adelante.

## Siguiente paso

Cuando la sesión principal cierre la Fase 2 del motor:
- **W1**: crear `rulesets/willy/` (con tests), `content/willy/game.ts`, el preset de arte `ninja` y la calle fija de la Planta 1.
- Mientras tanto, la sesión principal puede valorar las peticiones de `ENGINE_REQUESTS.md`; las más baratas y útiles para los dos juegos son R10 (cambio de mapa), R12 (RNG derivados), R14 (capa `markers`) y R11 (eventos con causa, ya en la Fase 2).

## Notas para retomar

- Los datos JSON se validaron con un script de comprobación cruzada (ids de objetos en tablas, clases, patrocinadores y logros; rarezas; pistas de ocultos; ids de frases únicos). Al crear `rulesets/willy/`, convertirlo en test de contenido (`tests/content/willy-data.test.ts`) junto con el test de variables del Narrador.
- Todo lo de *Willy* respeta las fronteras: solo `docs/willy/` y `content/willy/` (salvo `cinematics/` y `public/assets/cinematics/`, que son de la sesión de arte).
