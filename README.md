# willysGate

Motor de RPG táctico isométrico por turnos para navegador, con estética retro, y los juegos construidos sobre él.

| Juego | Reglas | Estado | Jugar |
|---|---|---|---|
| **Intereses**: fantasía oscura y deudas en el pueblo minero de Hondonegra | 5e simplificado (SRD 5.1) | Fase 1: esqueleto técnico | https://wilheim77.github.io/willysGate/intereses/ |

## Requisitos

Node 22 o superior.

## Uso

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:5173. Para arrancar otro juego, usa `GAME=<id> npm run dev`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (por defecto, `GAME=intereses`) |
| `npm test` | Tests (Vitest) |
| `npm run check` | Typecheck de todas las capas y tests. Hay que pasarlo antes de cada commit. |
| `npm run coverage` | Cobertura de `engine/` y `rulesets/` |
| `npm run build:all` | Construye todos los juegos en `dist/<juego>/` y la portada en `dist/index.html` |
| `npm run gen:placeholders` | Regenera el tileset placeholder |

## Controles

- **Ratón:** clic en una casilla para moverte, arrastrar para desplazar la cámara, rueda para el zoom, Q/E o los botones ⟲ ⟳ para girar el mapa 90°. Al pasar por encima se ve la ruta.
- **Táctil:** toca una casilla para moverte, arrastra para desplazar la cámara, pellizca para el zoom y usa los botones ⟲ ⟳ para girar. Pellizcar o arrastrar nunca mueve al personaje.

## Despliegue

Cada push a `main` ejecuta `.github/workflows/deploy.yml`, que pasa el typecheck y los tests, construye todos los juegos y publica en GitHub Pages. Para lanzarlo a mano: pestaña *Actions* → *Test and deploy* → *Run workflow*.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/PROGRESS.md](docs/PROGRESS.md) | Estado actual y siguiente paso. Es lo primero que hay que leer al retomar. |
| [docs/DESIGN.md](docs/DESIGN.md) | Arquitectura (motor, rulesets y contenido) y decisiones |
| [docs/NEW_GAME.md](docs/NEW_GAME.md) | Cómo crear un juego nuevo sobre el motor |
| [docs/STORY.md](docs/STORY.md) | Historia aprobada de *Intereses* |
| [docs/BRIEF.md](docs/BRIEF.md) | Encargo original |
| [CREDITS.md](CREDITS.md) | Créditos y licencias |
| [TODO-ART.md](TODO-ART.md) | Placeholders pendientes |
