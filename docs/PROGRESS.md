# Progreso

## Estado actual

- **Fase 0, Historia:** completada y aprobada (2026-10-16).
- **Fase 1, Esqueleto técnico:** **completada y aprobada** (2026-10-17). Arte: 0x72 como base y Ninja Adventure para exteriores. LPC se queda como preset alternativo.
- **Fase 2, Combate:** **completada** y probada por el usuario en el móvil (2026-10-17). Progresión del acto: de nivel 3 a 6.
- **Fase 3, Entorno táctico:** **aprobada** (2026-10-17).
- **Fase 4, Exploración, diálogos y grupo:** **en curso**. Decisiones (2026-10-17): creación por compra de puntos (con botón «recomendado»); la aprobación de los compañeros se muestra con reacciones («Garrán aprueba») y los números en la ficha. Retrato del Cobrador: variante A (bufanda).
- **Willy el mazmorrero:** un subagente trabaja en paralelo en la rama `willy` (diseño de la Fase 0, logros, cajas de botín y generación procedural). Solo toca `docs/willy/` y `content/willy/`.

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

### Fase 2 (en curso)
- [x] Motor: combate por turnos, acciones genéricas, interrupciones (ataque de oportunidad), IA genérica y efectos de teletransporte y de máximo de recurso. Esquema v2 con migración.
- [x] dnd5e: reglas de combate del SRD y las 4 clases con datos del nivel 1 al 6, conjuros de nivel 0 a 3, razas y monstruos.
- [x] Cliente: encuentro de prueba (grupo a nivel 3 contra los Sinpaga), HUD de combate, vista previa con glosario, registro de tiradas y juice básico. Probado en el navegador: el combate salta, el ataque con vista previa, Manos ardientes con salvaciones y los turnos de la IA funcionan.
- [x] Tests: 153.
- [x] Integrada la rama `art`: compañeros y Sinpaga recoloreados, tablones, andamio, techos de muro, antorchas y braseros animados, sangre, chispas, rebordes y las intros en viñetas de ambos juegos (guion de Intereses como borrador en `docs/intros/INTERESES.md`, pendiente de aprobación). En el render ya funcionan las antorchas, la sangre, las chispas y los rebordes.
- [x] Escala por sprite (Garrán a 1,15). Los seguidores ya buscan otra casilla si la suya no es alcanzable.
- [ ] Pendiente del arte: polvo al moverse, tile lógico de `scaffold` y reproductor de cinemáticas (Fase 6).
- [x] Integrada la rama `willy` (Fase W0 de *Willy el mazmorrero*: diseño, ruleset, narrador, logros, botín, procedural y peticiones al motor). Pendiente de aprobación del usuario: ver `docs/willy/PROGRESS.md`.
- [x] Integradas las clases nuevas de Willy: Funcionario, Jugador de basket e Ingeniero (con el 5G secreto que sube hasta 10G). Nueva petición al motor R15 (salto y rebote de proyectiles).
- [ ] Probar el combate completo en el móvil y ajustar el HUD.
- [ ] Equilibrar el encuentro de prueba y pulir (los compañeros a veces no siguen al líder en desniveles).

### Fase 3
- [x] Motor: línea de visión (también para la luz), empujones con caídas, superficies como datos, consecuencias encadenadas, objetos y una IA que evita el peligro.
- [x] 5e: superficies y reacciones, caídas, cobertura, elementos de los conjuros, Onda atronadora, Grasa, Empujar y barriles explosivos.
- [x] Arte (agente de arte): superficies animadas, barriles, cajas rotas, explosión y vapor.
- [x] Mapa de prueba con meseta alta, aceite, agua, escombros, cajas y barriles.
- [x] Corregido: tocar el sprite de un enemigo lo selecciona (antes podía caer en la casilla de arriba).
- [x] El fuego recorre todo el charco de aceite o grasa conectado, y el rayo toda el agua conectada. Probado en el navegador: explosión del barril, aceite ardiendo y luz del fuego.
- [x] Los ataques contra objetos (barriles, cajas) impactan siempre, sin crítico; la vista previa y el registro lo indican.
- [x] Fichas de personaje: retratos del grupo siempre en pantalla; tocar un retrato o una ficha de iniciativa abre la ficha (combate, características, habilidades, recursos, armas, conjuros, rasgos, defensas, estados), con «?» del glosario. El ruleset la rellena con `describeEntity` (genérico en el motor).
- [x] Registro de combate plegable (una línea / panel con desplazamiento); se recuerda la elección.
- [x] Revisión del subagente revisor (Fable) aplicada:
  - el fuego se apaga aunque el último de la iniciativa esté muerto;
  - Onda atronadora ya no daña al lanzador;
  - cajas y barriles no cuentan como enemigos pegados ni para el ataque furtivo;
  - un objeto destruido no da cobertura;
  - los conjuros con varios objetivos exigen ver a todos;
  - un compañero caído ocupa su casilla (`Ruleset.occupiesTile`);
  - los caídos sufren fuego y explosiones (se desangran antes);
  - levantarse del suelo cuesta la mitad del movimiento y resbalar detiene el paso;
  - el camino evita el fuego si le llega el movimiento (`movePath`, también en la vista previa) y marca en naranja las casillas peligrosas;
  - el alcance pintado cuenta el coste de los escombros;
  - las superficies pintadas en el mapa duran y dan luz como las demás;
  - los barriles dentro del fuego arden y acaban explotando.
- [x] Tests: 205.
- [x] Prueba del usuario en el móvil: **Fase 3 aprobada** (2026-10-17). Cambio pedido: el barril de aceite explota con el primer punto de daño.

## Planificado para más adelante

- **Efectos y ambiente** (2026-10-17): ver `DESIGN.md` → «Efectos y ambiente».
  - Fase 2: juice de combate, animaciones por código, contorno de selección y recoloreado por paleta.
  - Fase 3: la luz se bloquea con muros, el fuego ilumina y las superficies son visuales.
  - Fase 6: partículas de ambiente, postprocesado por escena, viñeta, CRT y ajuste de calidad.
- **Introducción y onboarding** (Fase 6): ver `DESIGN.md` → «Introducción y onboarding». El guion del prólogo está pendiente como anexo en `STORY.md`.

## Decisiones de la Fase 2 (aprobadas el 2026-10-17)

- **A 0 PG:** los personajes del grupo quedan inconscientes y se desangran en 3 turnos si nadie los cura o estabiliza, con el contador visible. Los enemigos mueren directamente.
- **Turnos:** iniciativa individual de 5e.
- **«Caída»** en la Fase 2 es caer a 0 PG. El daño por caer desde una altura llega con los empujones (Fase 3).
- **Grupo:** el jugador controla a todos los compañeros en combate.
- **Niveles:** se empieza a nivel 3 y se termina a nivel 5-6. Las clases tienen datos del 1 al 6, solo con contenido del SRD 5.1. La subida de nivel interactiva llega en la Fase 5.

## Decisiones abiertas

- ¿Un cuarto compañero **mago** opcional? Por ahora no.

## Siguiente paso

Implementar la Fase 2: turnos y combate en el motor, reglas de ataque y clases en dnd5e, IA, interfaz de combate y encuentro de prueba.
