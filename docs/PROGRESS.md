# Progreso

## Estado actual

- **Fase 0, Historia:** completada y aprobada (2026-10-16).
- **Fase 1, Esqueleto técnico:** completada y desplegada con el arte definitivo. **Pendiente de aprobación.**

## Hecho

### Fase 0
- [x] Elegida la premisa «Intereses». Historia aprobada en [`STORY.md`](STORY.md), con el Elfo como raza jugable y la enemistad entre elfos y enanos.
- [x] Encargo original guardado en [`BRIEF.md`](BRIEF.md).

### Fase 1
- [x] Vite 8, TypeScript 5, Phaser 3.90 y Vitest 5.
- [x] **Reestructuración aprobada:** el motor genérico (`engine/`), los rulesets (`rulesets/common`, `rulesets/dnd5e`) y el contenido por juego (`content/intereses/`) están separados. Ver [`DESIGN.md`](DESIGN.md) y [`NEW_GAME.md`](NEW_GAME.md).
- [x] `engine/`:
  - `GameState` serializable;
  - entidades con mapas genéricos de stats, recursos, condiciones y tags;
  - RNG sfc32 con su estado dentro del `GameState`;
  - A* con altura y reglas de movimiento que fija el ruleset;
  - comandos con un despachador ampliable por el ruleset;
  - efectos genéricos y pruebas (checks) con desglose genérico;
  - guardado y carga con migraciones del motor y del ruleset;
  - cargador de mapas de Tiled.
- [x] `rulesets/dnd5e`: atributos, habilidades, competencia, salvaciones, ventaja y desventaja (en `common/d20`), CD de conjuros, condiciones del SRD, condiciones de diálogo y `createCreature`.
- [x] Tests (99): el motor se prueba con un ruleset de juguete sin D&D, y un test de arquitectura hace cumplir las dependencias entre capas.
- [x] Cliente genérico:
  - render isométrico con bloques de altura;
  - mover con clic o toque, con la ruta previa al pasar el ratón;
  - desplazar la cámara arrastrando y zoom con la rueda o pellizcando;
  - HUD de guardar, cargar, exportar, importar y nueva partida.

  Probado en el navegador, en escritorio y en vista móvil.
- [x] Construcción de varios juegos (`npm run build:all`) y workflow de GitHub Actions para Pages.
- [x] README, CREDITS (incluida la atribución del SRD 5.1) y TODO-ART.

## Pendiente de la Fase 1

- [x] Repo `wilheim77/willysGate` creado (público), con GitHub Pages desplegado mediante Actions. El juego está en https://wilheim77.github.io/willysGate/intereses/ y la portada en https://wilheim77.github.io/willysGate/.
- [x] Arte elegido e integrado: Isometric Stone Soup (CC0) y Spell of Mastery (CC-BY 4.0), con `scripts/build-art.py` y el render con bloques de altura y personajes animados.
- [x] Giro del mapa en pasos de 90° (botones y Q/E). Pellizcar o arrastrar ya no mueve al personaje.

## Planificado para más adelante

- **Fase 6, introducción y onboarding** (añadido el 2026-10-16): pantalla de inicio, prólogo cinemático, tutorial integrado, tooltips de jerga con % de acierto, glosario, dificultad «Historia», feedback y revisión como jugador novato. Ver `DESIGN.md` → «Introducción y onboarding», con las piezas genéricas que hay que preparar ya en las Fases 2-4 (eventos por mecánica, `preview` sin RNG, `term` en los desgloses, `settings` en el estado). El guion del prólogo está pendiente como anexo en `STORY.md`.

## Decisiones abiertas

- ¿Un cuarto compañero **mago**, opcional, de modo que el jugador recluta 3 de 4? Por ahora no: se mantienen Dorotea, Garrán y Anselmo.

## Siguiente paso

Esperar la aprobación de la Fase 1 (y la confirmación de que el pellizco funciona bien en un móvil real). Después, presentar el plan de la Fase 2 (combate), que incluirá las piezas genéricas para el onboarding: eventos por mecánica, `preview` sin RNG, `term` en los desgloses y `settings` en el estado.
