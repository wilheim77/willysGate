# Willy el mazmorrero: progreso

> Rama: `willy`. Se trabaja en paralelo con la sesión principal (motor e *Intereses*), sin tocar código compartido.

## Estado actual

- **Fase W0, Diseño:** **completada, pendiente de aprobación del usuario** (2026-10-17).
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
| 6 razas y 6 clases (con 36 habilidades y mazo de ventajas) | `content/willy/data/races.json`, `classes.json` |
| 78 objetos (18 iniciales de clase, 60 de botín, 6 avisos, 6 cosméticos) | `content/willy/data/items.json` |
| Cajas, tablas de botín, piedad, cofres, botín de enemigos y mercado | `content/willy/data/loot-tables.json` |
| 90 logros (13 ocultos) con frase del Narrador y recompensa | `content/willy/data/achievements.json` |
| 6 patrocinadores con gustos, regalos y mensajes | `content/willy/data/sponsors.json` |
| Reglas de audiencia | `content/willy/data/audience.json` |
| 5 plantas (bioma, mecánica, reloj, generación, enemigos, jefe) y el Camerino | `content/willy/data/floors.json` |
| Tutorial integrado de la Planta 1 (28 pasos) | `content/willy/tutorial.json` |
| Glosario y «Cómo se juega» | `content/willy/texts/` |
| Narrador: 287 frases en 41 bancos | `content/willy/narrator/` |
| Metadatos para la portada | `content/willy/meta.json` |

## Pendiente de aprobación del usuario

1. **El diseño en conjunto** (sobre todo: reloj de acciones en vez de tiempo real, eliminación = volver al último Camerino, sin mejoras de poder entre partidas).
2. **Razas y clases**: ¿gustan las seis y seis? ¿Alguna fuera o alguna nueva?
3. **Final**: los tres desenlaces de `STORY.md` §4.
4. **Arte**: Ninja Adventure + 0x72 como base; ¿comprar LimeZu Modern Interiors para el Hipermercado y el Plató?
5. **Dirección de feedback** (formulario o correo) para el botón «Enviar comentario».
6. **Fuente**: `Press Start 2P` (más «tele retro») o `VT323` (más legible en móvil, la de *Intereses*).

## Siguiente paso

Cuando el usuario apruebe W0 y la sesión principal cierre la Fase 2 del motor:
- **W1**: crear `rulesets/willy/` (con tests), `content/willy/game.ts`, el preset de arte `ninja` y la calle fija de la Planta 1.
- Mientras tanto, la sesión principal puede valorar las peticiones de `ENGINE_REQUESTS.md`; las más baratas y útiles para los dos juegos son R10 (cambio de mapa), R12 (RNG derivados), R14 (capa `markers`) y R11 (eventos con causa, ya en la Fase 2).

## Notas para retomar

- Los datos JSON se validaron con un script de comprobación cruzada (ids de objetos en tablas, clases, patrocinadores y logros; rarezas; pistas de ocultos; ids de frases únicos). Al crear `rulesets/willy/`, convertirlo en test de contenido (`tests/content/willy-data.test.ts`) junto con el test de variables del Narrador.
- Todo lo de *Willy* respeta las fronteras: solo `docs/willy/` y `content/willy/` (salvo `cinematics/` y `public/assets/cinematics/`, que son de la sesión de arte).

## Decisiones del usuario (2026-10-17)

- **No se compra arte** (ni LimeZu ni ningún otro). El Hipermercado, El Plató y cualquier otro escenario se harán con packs gratuitos (Ninja Adventure, 0x72, Kenney…) y con arte creado por el agente de arte.
