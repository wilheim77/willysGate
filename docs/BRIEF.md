# Encargo original del proyecto

> Copia del encargo inicial (2026-10-16), para que cualquier sesión pueda retomarlo sin el historial de chat. Los cambios de alcance aprobados después se reflejan en `docs/DESIGN.md` y `docs/STORY.md`.
>
> **Cambios aprobados el 2026-10-17:**
> - **Vista cenital 3/4** en lugar de isométrica.
> - El arte puede ser CC-BY-SA (LPC) además de CC0 y CC-BY, y packs de pago con licencia que permita modificar. Nunca NoDerivatives.
> - Base de arte: 0x72 DungeonTileset II.
> - Sprites de 2 direcciones.
> - Efectos y ambiente como sistemas reutilizables.
>
> Ver `docs/DESIGN.md` y `docs/ART_OPTIONS.md`.
>
> **Cambio aprobado el 2026-10-16:** el motor se reutilizará para otros juegos con otras reglas, como uno de cazadores de vampiros con Sed, Fe y Luz. Por eso `core/` se divide en `engine/` (genérico), `rulesets/<id>/` y `content/<juego>/`. Ver `docs/DESIGN.md` y `docs/NEW_GAME.md`.

## Contexto

RPG táctico por turnos para navegador, inspirado en Baldur's Gate 3, con estética retro pixel art (originalmente isométrica; desde el 2026-10-17, cenital 3/4). Proyecto personal, desarrollado con Claude Code (a menudo en la nube y desde el móvil) y con el repo en GitHub. Cada sesión tiene que dejar el repo en un estado coherente, documentado y fácil de retomar.

El juego **no usa ningún LLM en tiempo de ejecución**: todas las reglas, diálogos y contenidos están escritos de antemano. El coste por partida es cero.

## Visión

- **Tono:** fantasía oscura al estilo Joe Abercrombie. Personajes grises y egoístas, violencia con consecuencias, humor negro y cínico, sin héroes elegidos ni profecías. Diálogos secos, ingeniosos y con mala leche. Las decisiones duelen y rara vez hay una opción "buena".
- **Idioma:** todos los textos del juego en español (castellano). El código, los nombres de variables y los comentarios, en inglés.
- **Grupo:** protagonista creado por el jugador más 2-3 compañeros fijos con personalidad, voz y agenda propias. Comentan y discrepan en los diálogos. En esta fase no hay sistema de aprobación.
- **Alcance de la primera versión:** un acto de 2-3 horas. Un asentamiento, sus alrededores y una mazmorra, con un jefe final y al menos 3 decisiones con consecuencias visibles dentro del propio acto.

## Mecánicas imprescindibles

1. Combate táctico por turnos en cuadrícula isométrica: iniciativa, acción, acción adicional, movimiento y reacción (ataque de oportunidad).
2. Reglas 5e simplificadas basadas en el SRD 5.1 (CC-BY 4.0): d20, ventaja y desventaja, CA, CD, salvaciones, críticos. ~~Niveles 1 a 4~~ **Niveles 3 a 6** (cambio aprobado el 2026-10-17: se empieza a nivel 3 y se termina a nivel 5-6; los datos de clase cubren del 1 al 6).
   - Clases: Guerrero, Pícaro, Mago y Clérigo, con 3-5 habilidades o conjuros por nivel.
   - Razas con rasgos sencillos (aprobadas: Humano, Elfo, Enano, Mediano y Semiorco).
3. Entorno táctico:
   - Altura: ventaja al atacar desde arriba y daño por caída.
   - Empujar (empujón y conjuros de empuje).
   - Superficies que interactúan: aceite + fuego = llamas, agua + rayo = electrocución, agua + frío = hielo resbaladizo.
   - Línea de visión y cobertura.
   - Objetos destructibles, como barriles explosivos.
4. Diálogos con tiradas de habilidad visibles («[Persuasión] CD 14»). Se muestra el d20 en pantalla con modificadores y con ventaja o desventaja según el contexto. Árboles ramificados con condiciones (flags, clase, raza, objetos, tiradas anteriores).
5. Exploración: fuera de combate el grupo se mueve unido siguiendo al líder. Objetos interactuables, cofres, trampas con tirada de Percepción e inventario básico.
6. Guardado y carga en localStorage, con exportación e importación a JSON.

## Arquitectura (obligatoria)

Tiene que poder evolucionar a multijugador por turnos (primero hotseat y después asíncrono online) sin reescribir el núcleo.

- **Motor de reglas separado del render:** `core/` en TypeScript puro, sin Phaser, testeable en Node.
- **Estado único y serializable (`GameState`):** mapa, entidades, stats, inventarios, flags de historia, turno actual y semilla del RNG.
- **Patrón comando:** toda acción es un comando. El motor lo valida contra el estado y devuelve el nuevo estado más una lista de eventos para animar. La interfaz nunca modifica el estado directamente.
- **RNG determinista** con la semilla guardada en el estado.
- **`controllerId`** en cada entidad (jugador o IA).
- **Contenido como datos** en `content/`: mapas Tiled en JSON, diálogos en JSON o YAML con esquema validado, y clases, conjuros, objetos y enemigos. Añadir contenido no debe requerir tocar el motor.
- **Capa de assets abstraída** mediante un manifiesto de sprites.
- **IA enemiga** sencilla pero decente: evalúa objetivos por amenaza, distancia y vida, usa cobertura y altura, y aprovecha las superficies.

## Stack

TypeScript, Vite y Phaser 3 (render isométrico), con Vitest para los tests. El core necesita buena cobertura: tiradas, ventaja, superficies, línea de visión, iniciativa y diálogos condicionales. Los mapas se hacen en Tiled (JSON). El despliegue es en GitHub Pages con GitHub Actions. Se juega con ratón y tiene que ser usable en táctil.

## Arte y sonido

- Packs gratuitos CC0 o CC-BY (Kenney, itch.io, OpenGameArt), con un tono de fantasía oscura y un estilo coherente entre packs.
- `CREDITS.md` recoge cada asset con su autor, licencia y URL.
- Los placeholders se anotan en `TODO-ART.md`.
- Paleta oscura y desaturada. Interfaz sobria, con marcos de piedra o hierro y una tipografía pixel legible.

## Forma de trabajar

Se trabaja por fases. Al terminar cada una, se para y se espera la aprobación del usuario. Antes de empezar una fase se presenta un plan breve, y hay que esperar el visto bueno si incluye decisiones de diseño relevantes.

Los commits son pequeños y descriptivos, y los tests del core tienen que pasar antes de cada commit. No se añaden dependencias pesadas sin justificarlas. Si algo del diseño choca con la arquitectura (estado serializable y comandos), se avisa en lugar de saltárselo. Al final de cada sesión se actualiza `docs/PROGRESS.md`.

### Documentos del repo

`README.md`, `docs/DESIGN.md`, `docs/PROGRESS.md` y `docs/STORY.md`.

### Fases

0. **Historia:** premisas, elección y desarrollo. Sin código.
1. **Esqueleto técnico:**
   - Vite, Phaser y Vitest, con el despliegue en Pages funcionando.
   - `core/` con `GameState`, comandos, RNG con semilla y guardado y carga.
   - Un mapa isométrico de prueba con un personaje que se mueve por la cuadrícula con pathfinding.
2. **Combate:**
   - Iniciativa, turnos, acciones, ataque, daño, muerte y caída.
   - Las 4 clases ~~a nivel 1~~ con sus rasgos y conjuros del nivel 1 al 6 como datos; el encuentro de prueba se juega a nivel 3.
   - IA enemiga.
   - Un encuentro de prueba completo.
   - *Añadido:* juice de combate, animaciones por código (ataque, golpe, muerte, conjuro), contorno de selección y recoloreado por paleta de enemigos.
3. **Entorno táctico:** altura, empujar, superficies, línea de visión, cobertura y objetos explosivos.
   - *Añadido:* la luz se bloquea con muros, el fuego ilumina y las superficies son visuales y animadas.
4. **Diálogos y exploración:**
   - Motor de diálogos con tiradas visibles, flags e inventario.
   - Interactuables y trampas.
   - Creación de personaje con point buy.
   - Reclutamiento de compañeros.
5. **Contenido del acto:** el acto completo, la subida de nivel de 3 a 6 y el balance de encuentros.
6. **Pulido:** menús, interfaz, sonido y música CC0, feedback de las tiradas, un tutorial mínimo, revisión de bugs y una partida completa de principio a fin.
   - **Añadido el 2026-10-17:** partículas de ambiente (niebla, polvo, ceniza, lluvia), corrección de color por escena, viñeta, CRT opcional y ajuste de calidad (bajo, medio, alto).
   - **Añadido el 2026-10-16: introducción y onboarding** para jugadores que no conocen D&D: pantalla de inicio, prólogo cinemático que se puede saltar, primer encuentro como tutorial integrado, tooltips de jerga con % de acierto, glosario, consejos desactivables, dificultad «Historia», botón de feedback y revisión final como jugador novato. Detalle en `docs/DESIGN.md` → «Introducción y onboarding».
