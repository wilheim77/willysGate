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
| Peticiones al motor y al cliente (R1-R14) | [`ENGINE_REQUESTS.md`](ENGINE_REQUESTS.md) |
| 6 razas y 7 clases, incluida la especial Ingeniero de 5G (42 habilidades y mazo de ventajas) | `content/willy/data/races.json`, `classes.json` |
| 83 objetos (21 iniciales de clase, 62 de botín, avisos y cosméticos) | `content/willy/data/items.json` |
| Cajas, tablas de botín, piedad, cofres, botín de enemigos y mercado | `content/willy/data/loot-tables.json` |
| 102 logros (17 ocultos) con frase del Narrador y recompensa | `content/willy/data/achievements.json` |
| 6 patrocinadores con gustos, regalos y mensajes | `content/willy/data/sponsors.json` |
| Reglas de audiencia | `content/willy/data/audience.json` |
| 5 plantas (bioma, mecánica, reloj, generación, enemigos, jefe) y el Camerino | `content/willy/data/floors.json` |
| Tutorial integrado de la Planta 1 (28 pasos) | `content/willy/tutorial.json` |
| Glosario y «Cómo se juega» | `content/willy/texts/` |
| Narrador: 313 frases en 47 bancos | `content/willy/narrator/` |
| Metadatos para la portada | `content/willy/meta.json` |

## Decisiones del usuario (2026-10-17)

W0 **aprobada** con estos cambios, ya aplicados en los documentos y los datos:

| # | Tema | Decisión | Dónde se refleja |
|---|---|---|---|
| 1 | Reloj de planta | Aprobado tal cual: reloj de acciones (1 s por casilla, 15 s por ronda, 3 s por interacción); el derrumbe baja a Willy a la planta siguiente con −30 % de vida | `DESIGN.md` §4 |
| 2 | Eliminación | Se elige al empezar: **Con repetición** (normal: vuelta al último Camerino y la planta se regenera) o **Sin repetición** (hardcore: muerte permanente, una sola ranura con autoguardado, sin poder recargar) | `DESIGN.md` §12, `RULESET.md`, logros «Una sola toma» y «Programa cancelado», bancos del Narrador `inicioSinRepeticion` y `willyEliminadoSinRepeticion`, `ENGINE_REQUESTS.md` R9 |
| 3 | Entre partidas | Solo variedad (objetos en las tablas, cosméticos), nunca poder permanente | `DESIGN.md` §12 |
| 4 | Razas y clases | Se quedan las 12 y se añade la clase especial **Ingeniero de 5G** (para un amigo del usuario): autómatas, antena-torreta y rayos 5G; desventaja «Cobertura irregular» | `classes.json`, 3 objetos iniciales y 2 cosméticos en `items.json`, 7 logros (categoría «Ingeniero de 5G»), 4 bancos del Narrador, `RULESET.md`, `STORY.md`, R13 ampliada (invocaciones) |
| 5 | Final | Los tres: el jugador elige A o B; C (secreto) aparece si se cumplen sus condiciones | `STORY.md` §4, logros ocultos `final-a`, `final-b`, `final-c` |
| 6 | Fuente | Las dos: **Press Start 2P** para títulos y rótulos del programa; **VT323** para diálogos y Narrador | `DESIGN.md` §13 y §15, R9 (`titleFontFamily`) |
| 7 | Feedback | **Sin botón por ahora.** No se publica correo ni formulario. TODO para el futuro (`feedbackUrl` opcional) | `DESIGN.md` §13 y §15, R9 |
| 8 | Arte | **No se compra arte** (ni LimeZu ni ningún otro). Ninja Adventure + 0x72 + Kenney + arte propio de la sesión de arte | `DESIGN.md` §14 |

**Cifras tras los cambios:** 6 razas, 7 clases (42 habilidades), 83 objetos, 102 logros (17 ocultos), 313 frases del Narrador en 47 bancos.

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
