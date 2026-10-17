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
| Willy siempre humano (rasgos fijos) y 9 clases, incluidas las especiales Ingeniero, Funcionario y Jugador de basket (57 habilidades y mazo de ventajas) | `content/willy/data/willy.json`, `classes.json` |
| 5 mazmorreros rivales no humanos (antes razas jugables) | `content/willy/data/rivals.json` |
| 93 objetos (27 iniciales de clase, 66 de botín, avisos y cosméticos) | `content/willy/data/items.json` |
| Cajas, tablas de botín, piedad, cofres, botín de enemigos y mercado | `content/willy/data/loot-tables.json` |
| 131 logros (24 ocultos) con frase del Narrador y recompensa | `content/willy/data/achievements.json` |
| 6 patrocinadores con gustos, regalos y mensajes | `content/willy/data/sponsors.json` |
| Reglas de audiencia | `content/willy/data/audience.json` |
| 5 plantas (bioma, mecánica, reloj, generación, enemigos, jefe) y el Camerino | `content/willy/data/floors.json` |
| Tutorial integrado de la Planta 1 (28 pasos) | `content/willy/tutorial.json` |
| Glosario y «Cómo se juega» | `content/willy/texts/` |
| Narrador: 383 frases en 61 bancos | `content/willy/narrator/` |
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

| 13 | Jefe final | El Presentador pasa a ser **«Jordi Hurtado, el Inmortal»**: vampiro alienígena que se alimenta de audiencia y por eso no envejece (homenaje cariñoso y absurdo al meme; nada sobre la persona real). Combate en 3 fases (Ronda de preguntas con trampillas, Pausa publicitaria a oscuras vulnerable solo a focos, Gran final con votación), medidor **Share** que lo hace inmortal mientras tenga audiencia, 8 preguntas en datos, 11 frases propias, finales y gancho de Temporada 2 reescritos. **El nombre está en un único campo:** `content/willy/data/cast.json`; todos los textos usan `{presentador}` | `cast.json`, `floors.json` (jefe), banco `presentador` y líneas `je-5a/5b`, `jd-5`, `ws-05`, 4 logros nuevos (uno oculto) y 3 frases de logros, `STORY.md`, `DESIGN.md`, R5 (variables globales) |

| 14 | Willy siempre humano | El personaje del jugador es **siempre humano** (castreño): ya no se elige raza en el cásting, solo clase. Los rasgos castreños pasan a ser fijos (`willy.json`). Las otras 5 razas pasan a ser **mazmorreros rivales** (PNJ): Vanesa la Gaviota, Don Ceferino, Gorka de Compras, Mari Luz y Asterio, con sus rasgos de raza, plantas, frases y tres desenlaces (derrotar, pactar, dejar ir) | `willy.json`, `rivals.json` (sustituyen a `races.json`), banco `rivalAparece`, líneas del cásting por clase, logro «Cásting completo» (6 clases), 3 logros nuevos, glosario, tutorial, `STORY.md`, `RULESET.md`, `DESIGN.md` |
| 15 | Arte | El encargo de arte de *Willy* se envía directamente a la sesión de arte | `ART_BRIEF.md` |

| 16 | Rivales procedurales | Los mazmorreros rivales se **generan** por partida a partir de la semilla (raza × nombre × apodo × pueblo × oficio × personalidad × manía × aspecto × kit × comportamiento × frases por plantilla × gancho), sin repetirse en la partida ni con los últimos 40 del navegador. Los 5 de antes pasan a ser **legendarios** raros (6 %). Vuelven con memoria del desenlace; los tramposos pueden traicionar. Arte modular: cuerpo por raza + paleta + accesorios | `rival-generator.json`, `rivals.json` (legendarios), banco `rivalAparece`, 4 logros nuevos, glosario, `STORY.md`, `RULESET.md`, `DESIGN.md` §17, R16, `ART_BRIEF.md` |

**Cifras tras los cambios:** Willy humano, 9 clases (57 habilidades), rivales procedurales (12 millones de identidades) + 5 legendarios, 93 objetos, 135 logros (26 ocultos), 405 frases del Narrador en 62 bancos.

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

## Rondas de pulido (textos, logros y cajas)

| Ronda | Fecha | Cambios |
|---|---|---|
| 1 | 2026-10-17 | 15 líneas reescritas (menos «catorce galaxias» y «once mil años»: de 19 y 10 apariciones a 8 y 7), 7 líneas nuevas con guiños a rivales, clases y al presentador, 1 línea floja sustituida. **Logros:** «Zapping» era imposible (la audiencia nunca baja del mínimo de la planta) y ahora pide llegar a ese mínimo; aclaradas 4 descripciones (5G y logros que solo puede conseguir una clase). **Cajas:** dos legendarios (Remo de la Castreña y Llavero de Producción) disponibles desde la primera partida, para que una tirada legendaria nunca se quede sin objetos en un perfil nuevo; sus logros dan ahora una caja de plata. |
| 2 | 2026-10-17 | **Rivales:** las razas tienen forma en minúscula y con género para mitad de frase (`enFrase`: «gnoma de jardín», «minotaura vegana»); fuera la plantilla que ponía una coletilla con «¡» en minúscula tras «Y»; «influencer de su pueblo» → «influencer de pueblo» (chocaba en primera persona); 18 plantillas de frases nuevas (las 8 situaciones tienen ahora 5 cada una) y 4 líneas nuevas del Narrador para rivales, con versión masculina y femenina donde hacía falta. Comprobado renderizando las 40 plantillas con 3.000 rivales al azar de ambos géneros: ninguna variable sin resolver. **Logros de rivales:** usan las variables del rival (`{rivalNombre}`, `{rivalApodo}`) en lugar de las de enemigo. |
| 3 | 2026-10-17 | **Botín:** la categoría «herramientas» de bronce solo tenía el paraguas (salía siempre él en las cajas de bronce): añadidas la Caña de pescar del abuelo y el Rodillo de cocina. No había consumibles legendarios: añadido el **Share embotellado** (único; se desbloquea con «Apagón de audiencia»). 4 textos de sabor corregidos o afinados (concordancia «una tuba», extintor). **Apertura de cajas:** 8 líneas nuevas del Narrador (aperturas propias del Tasador, la Influencer y el Funcionario; cajas solo de consumibles; repetidos; Share embotellado). **Logros:** 4 descripciones aclaradas (dónde ocurren: Planta 1 y 2, hielo) y la frase de «Apagón de audiencia» anuncia el desbloqueo. Total: 96 objetos, 417 frases. |
