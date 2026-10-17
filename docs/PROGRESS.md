# Progreso

## Estado actual

- **Fase 0, Historia:** completada y aprobada (2026-10-16).
- **Fase 1, Esqueleto técnico:** **completada y aprobada** (2026-10-17). Arte: 0x72 como base y Ninja Adventure para exteriores. LPC se queda como preset alternativo.
- **Fase 2, Combate:** plan propuesto y pendiente del visto bueno.

## Hecho

### Fase 0
- [x] Historia «Intereses» aprobada ([`STORY.md`](STORY.md)), con el Elfo como raza y la enemistad entre elfos y enanos.
- [x] Encargo original y cambios aprobados en [`BRIEF.md`](BRIEF.md).

### Fase 1
- [x] Vite 8, TypeScript 5, Phaser 3.90, Vitest 5 y despliegue de varios juegos en GitHub Pages.
- [x] Capas `engine/` (genérico), `rulesets/` (`common`, `dnd5e`) y `content/<juego>/`, con un test de arquitectura y un ruleset de juguete sin D&D. Ver [`DESIGN.md`](DESIGN.md) y [`NEW_GAME.md`](NEW_GAME.md).
- [x] Motor:
  - `GameState` serializable con stats, recursos y condiciones genéricos;
  - RNG sfc32 con su estado dentro del `GameState`;
  - A* con altura;
  - comandos y efectos;
  - pruebas (checks) con desglose genérico;
  - guardado con migraciones;
  - cargador de Tiled ortogonal e isométrico;
  - **sistema de iluminación** (fuentes fijas o llevadas por una entidad, luz ambiente y `lightLevelAt`).
- [x] **Cambio a vista cenital 3/4** (2026-10-17):
  - render ortogonal con capas de elevación (caras de acantilado o muro, bordes y sombras);
  - sin giro de mapa;
  - sprites de 2 direcciones con volteo, o de 4 (LPC);
  - sombra de contacto y respiración en reposo por código.
- [x] Iluminación en el cliente: oscuridad, linterna del protagonista y antorchas con parpadeo. Filtro de color por preset.
- [x] **Pipelines de arte reproducibles** (`npm run art`):
  - tiles por preset;
  - personajes LPC por capas, con créditos generados automáticamente;
  - sprites de atlas (0x72).
- [x] Escenas de prueba con el mismo mapa: `?arte=0x72` (por defecto) y `?arte=lpc`. Comparativa en [`ART_OPTIONS.md`](ART_OPTIONS.md).
- [x] Licencias: código MIT (`LICENSE`); arte derivado de LPC, CC-BY-SA 3.0 (`CREDITS.md`).
- [x] Tests: 107.

- [x] Arte elegido: 0x72 (base) y Ninja Adventure (exteriores, ya integrado en tierra y acantilados).
- [x] Confirmado en un móvil real que pellizcar no mueve al personaje.

## Planificado para más adelante

- **Efectos y ambiente** (2026-10-17): ver `DESIGN.md` → «Efectos y ambiente».
  - Fase 2: juice de combate, animaciones por código, contorno de selección y recoloreado por paleta.
  - Fase 3: la luz se bloquea con muros, el fuego ilumina y las superficies son visuales.
  - Fase 6: partículas de ambiente, postprocesado por escena, viñeta, CRT y ajuste de calidad.
- **Introducción y onboarding** (Fase 6): ver `DESIGN.md` → «Introducción y onboarding». El guion del prólogo está pendiente como anexo en `STORY.md`.

## Decisiones abiertas

- ¿Un cuarto compañero **mago** opcional? Por ahora no.

## Siguiente paso

Aprobar el plan de la Fase 2 (combate) y empezar a implementarlo.
