# Willy el mazmorrero: diseño

> Estado: **aprobado por el usuario con cambios** (Fase 0 de *Willy*, 2026-10-17). Las decisiones del usuario están en [`PROGRESS.md`](PROGRESS.md) → «Decisiones del usuario» y ya están aplicadas aquí.
> Historia: [`STORY.md`](STORY.md) · Prólogo: [`INTRO.md`](INTRO.md) · Reglas: [`RULESET.md`](RULESET.md) · Peticiones al motor: [`ENGINE_REQUESTS.md`](ENGINE_REQUESTS.md) · Estado: [`PROGRESS.md`](PROGRESS.md)

## Índice

1. Bucle de juego
2. Qué reutiliza del motor y qué cambia respecto a *Intereses*
3. Plantas híbridas y generación procedural
4. Reloj de planta
5. Combate y entorno
6. Audiencia
7. Patrocinadores
8. Cajas de botín
9. Logros
10. Narrador
11. Camerino: mercado y zona segura
12. Progresión, eliminación y perfil por navegador
13. Introducción y onboarding
14. Arte y sonido
15. `GameDefinition` prevista
16. Plan por fases
17. Mazmorreros rivales procedurales

---

## 1. Bucle de juego

```
Pantalla de inicio → Prólogo (saltable) → Planta 1 (tutorial + cásting)
  → [Planta N: explorar · combatir · cajas · patrocinadores · reloj]
  → Camerino (comprar, vender, descansar, guardar) → Planta N+1 … → el Presentador (jefe final)
```

- **Una partida = una temporada**: 5 plantas y un final. Duración objetivo: **3-4 horas** la primera vez (35-50 min por planta).
- Cada planta: llegar a la **escalera de bajada** antes de que el **reloj** llegue a cero, ganando audiencia por el camino y derrotando al jefe que guarda la escalera.
- **Modo de eliminación, elegido al empezar** (ver §12): **Con repetición** (normal: si Willy cae, vuelve al último Camerino y la planta se regenera) o **Sin repetición** (hardcore: muerte permanente, la temporada termina).
- La rejugabilidad viene de la generación procedural, las 9 clases (Willy siempre es humano), los 5 mazmorreros rivales, los logros por navegador, la dificultad Prime time y el modo Sin repetición.

## 2. Qué reutiliza del motor y qué cambia

| Pieza | Viene de | En *Willy* |
|---|---|---|
| Cuadrícula ortogonal, altura, A*, vista 3/4 | Fase 1 (hecho) | Igual. Tiles de 16 px. |
| Iluminación | Fase 1 (hecho) | Planta 3 y 5 oscuras; farolillos y focos como luces. |
| Combate por turnos, iniciativa, IA | Fase 2 del motor | Igual, con el ruleset `willy`. |
| Superficies, empujar, caídas, línea de visión | Fase 3 del motor | **El corazón del juego**: el público premia el entorno. |
| Guardado, migraciones | Fase 1 | Guardado solo en el Camerino (y autoguardado de suspensión). |
| Onboarding (título, prólogo, tutorial, glosario) | Plan de la Fase 6 | Adelantado: *Willy* lo necesita desde su primera versión jugable. |

**Diferencias con *Intereses***:
- Ruleset propio (`willy`), no `dnd5e`.
- Mapas **generados** en vez de un acto hecho a mano.
- Sistemas nuevos: **reloj de planta**, **audiencia**, **patrocinadores**, **cajas de botín**, **logros**, **Narrador**, **mercado**. Todos genéricos donde tiene sentido (ver `ENGINE_REQUESTS.md`), con los datos en `content/willy/`.
- Sin diálogos ramificados largos: conversaciones cortas en el Camerino y escenas fijas.
- Tono: comedia luminosa en vez de grimdark.

## 3. Plantas híbridas y generación procedural

### Qué es fijo y qué es procedural

| Fijo (hecho a mano en Tiled) | Procedural (piezas + reglas) |
|---|---|
| Sala de inicio de cada planta | Salas de combate, tesoro, trampa y vacías |
| Escenas de historia (cásting, Koldo en congelados, tómbola, sauna, despacho de Xelda) | Distribución de enemigos, trampas, cofres y superficies |
| Sala del jefe | Pasillos y conexiones |
| Tutorial de la Planta 1 (dos salas) | Altura base de cada sala |
| El Camerino | Luces y decoración variable |

Los datos de cada planta están en `content/willy/data/floors.json` → `generacion`.

### Algoritmo (genérico; vive en el motor, ver `ENGINE_REQUESTS.md` → R1)

1. **Semilla de planta.** `seedPlanta = hashSeed(semillaPartida + ":" + planta + ":" + intento)`. Se usa un RNG **propio de la generación**, no el del combate: lo que hagas en la Planta 1 no cambia cómo es la Planta 2. `intento` sube si te eliminan y repites la planta (la mazmorra «se recoloca»).
2. **Rejilla de celdas.** La planta es una rejilla de `columnas × filas` celdas de `ancho × alto` casillas (p. ej. 5×4 celdas de 13×11 en la Planta 1). Cada sala ocupa 1 celda o un bloque de celdas (las fijas declaran su tamaño: el jefe, 2×2).
3. **Grafo de salas.**
   - Se colocan primero las salas fijas: `inicio` en una celda del borde, `jefe` a máxima distancia, `escena` en el tramo indicado del camino crítico.
   - **Camino crítico**: paseo aleatorio sin cruces de longitud `caminoCritico` entre inicio y jefe.
   - **Ramas**: `ramas` caminos cortos (1-2 salas) que salen del crítico; los roles `tesoro` solo van en ramas.
   - **Bucles**: con probabilidad `probBucle` se une una rama con una sala vecina del crítico.
4. **Roles.** Cada sala procedural recibe un rol (`combate`, `tesoro`, `trampa`, `vacia`) por pesos. Nunca dos salas `vacia` seguidas en el camino crítico.
5. **Plantillas.** Para cada sala se elige una plantilla de `content/willy/maps/rooms/<bioma>/` compatible con: tamaño, **puertas necesarias** (N/S/E/O), rol (etiquetas de la plantilla) y planta mínima. Se puede **voltear en horizontal** (no en vertical: en 3/4 los muros del norte tienen cara y los del sur no). Cada plantilla tiene peso; las usadas en las dos últimas plantas pesan la mitad.
6. **Puertas y pasillos.** Cada plantilla tiene **enchufes** de puerta en el centro de cada lado. Entre dos salas vecinas se traza un pasillo recto de 3 casillas de ancho (o 1 si la plantilla lo pide) entre enchufes. Si las alturas base difieren, el pasillo lleva una **rampa** (una casilla por nivel; máximo 1 nivel de salto entre salas, `maxSaltoEntreSalas`).
7. **Población** (por marcadores de la plantilla, todo con el RNG de generación):
   - `enemigo`: se gasta un **presupuesto** = `base + porProfundidad × índice en el camino crítico`, × `multRol`. Se compran enemigos de la tabla de la planta por `coste`, respetando el máximo de marcadores. Los élites (mímicos) solo como cofres.
   - `cofre`, `trampa`, `luz`, `superficie` (con probabilidad y tipo por bioma), `deco`.
   - Mecánica característica: cintas, carritos, barriles, focos… según `mecanica.reglas`.
   - **Escalera de bajada**: siempre en la sala del jefe, detrás de él.
8. **Validación** (ver «Garantías»). Si falla, se reintenta con `seedPlanta + n` (máximo 20). Si los 20 fallan, se usa la **planta de respaldo** hecha a mano de ese bioma (`fixed/pN-respaldo.json`) y se registra un aviso en consola. Los tests lo hacen imposible en la práctica (ver abajo).
9. **Salida.** Un `GridMap` normal más `spawns`, `luces`, `marcadores` y el **grafo de salas** (lo usan el reloj, el mapa y el derrumbe). Se **guarda en el `GameState`** (no se regenera al cargar), así una actualización del generador no rompe partidas guardadas.

### Garantías

| Garantía | Cómo se comprueba |
|---|---|
| Conectividad | Relleno por inundación desde el inicio con `ruleset.movement` (`maxStep`): todas las puertas, cofres y la escalera son alcanzables a pie, sin objetos ni habilidades. |
| Sin bloqueos por altura | Cada transición entre salas tiene rampa; las plantillas declaran sus zonas altas con al menos un acceso. |
| Sin emboscadas injustas | Ningún enemigo a menos de 6 casillas del punto de aparición; la sala de inicio nunca tiene enemigos ni trampas. |
| Reloj suficiente | Distancia a pie inicio→escalera (en segundos de reloj) ≤ 40 % del reloj de la planta. Si no, se reintenta. |
| Trampas evitables | Ninguna trampa en una casilla que sea paso obligatorio (punto de articulación del grafo de casillas). |
| Recompensa mínima | Al menos 2 cofres por planta y uno en el camino crítico. |
| Reproducible | Misma semilla + misma versión del generador = mismo mapa, byte a byte. |

**Tests (CI):** para cada planta, generar 500 semillas y comprobar todas las garantías; y una prueba de instantánea («snapshot») con 3 semillas fijas para detectar cambios accidentales.

### Plantillas en Tiled

- Mismo formato de mapa que *Intereses* (tileset lógico, capa `ground` con `terrain`, `height`, `walkable`).
- Capa de objetos **`markers`** (nueva; ver R1): puntos o rectángulos con `type` = `door` (con `side`), `enemy`, `chest`, `trap`, `light`, `surface`, `deco`, `exit`, `mechanic`, y propiedades opcionales (`tier`, `chance`, `tags`).
- Propiedades del mapa: `roles` (lista), `minFloor`, `weight`, `cells` (p. ej. `1x1`).
- **Objetivo de contenido:** 12 plantillas por bioma para la primera versión jugable (60 en total), más 3-4 fijas por planta.

### Curva de dificultad

| Planta | Salas | Presupuesto base | Reloj | Nivel esperado al entrar → salir |
|---|---|---|---|---|
| 1 | 7-9 | 4 | 20:00 | 1 → 4 |
| 2 | 9-11 | 6 | 17:00 | 4 → 6 |
| 3 | 10-12 | 7 | 16:00 | 6 → 8 |
| 4 | 10-12 | 8 | 15:00 | 8 → 10 |
| 5 | 10-12 | 9 | 15:00 | 10 → 12 |

El presupuesto crece también **dentro** de la planta (más profundo en el camino crítico = más enemigos), y el jefe es el pico.

## 4. Reloj de planta

### Decisión: reloj de acciones, expresado en «segundos de emisión»

El reloj **no es tiempo real**. Cada acción descuenta segundos de un contador de la planta:

| Acción | Coste |
|---|---|
| Andar 1 casilla fuera de combate | 1 s |
| Cada ronda de combate | 15 s |
| Abrir una puerta, cofre o interactuar | 3 s |
| Prueba fuera de combate (forzar, trepar) | 5 s |
| Pensar, menús, mochila, abrir cajas de botín, diálogos | 0 s |
| Combate contra el jefe | Reloj en pausa |

**Por qué así y no en tiempo real ni en turnos a secas:**
- **Tiempo real** castiga pensar, que es la gracia de un táctico; rompe el juego en el móvil (te llaman, se bloquea la pantalla) y no es determinista (no se puede guardar ni reproducir).
- **Turnos a secas** no dice nada fuera del combate, que es donde se pierde el tiempo de verdad (explorar ramas, volver atrás).
- Las acciones lo cubren todo, son deterministas y viven en el `GameState`. Mostrarlo como **mm:ss** mantiene la sensación de programa en directo.

### Presión sin frustración

- **Holgura:** el camino directo cuesta como mucho el 40 % del reloj; explorar todo suele costar 80-100 %. Explorar es una apuesta, no una obligación.
- **Avisos** al 50, 25 y 10 % (Narrador + temblor de pantalla + música que se acelera). El HUD se pone ámbar y luego rojo.
- **Recuperar tiempo:** el aviso «Pausa publicitaria» (+90 s) y el Cronómetro de regidor (+120 s).
- **Derrumbe gradual:** a cero, las salas caen de una en una, de la más lejana a la salida a la más cercana, 10 s de reloj por sala, con un aviso de 1 ronda antes de cada una. Las salas derrumbadas se ven en el mapa.
- **El derrumbe nunca elimina.** Si pilla a Willy, cae a la planta siguiente: pierde el 30 % de su vida máxima (nunca baja de 1), se salta el Camerino y llega Tumbado. Es un castigo claro, pero la partida sigue (y hay un logro).
- **Dificultad Turista:** reloj ×1,5. **Prime time:** ×0,8.
- **El Funcionario** paga 1 s más por interacción (su horario de ventanilla).

## 5. Combate y entorno

Reglas completas en `RULESET.md`. Lo que importa para el diseño:
- **Empujar es barato y fuerte** (1 acción, sin ataques de oportunidad por defecto): el entorno es la mejor arma y la que más audiencia da.
- Cada planta tiene una **mecánica característica** que añade una forma nueva de usar el entorno (marea, cintas y carritos, pólvora, hielo y vapor, focos y decorados).
- Los **jefes** tienen un punto débil ligado a esa mecánica (ver `floors.json`).
- **Invocaciones (Ingeniero, Jugador de basket, Influencer):** el Autómata repetidor, la Antena repetidora, Chencho el base y los fans son entidades normales creadas con `spawnEntity` (R13). Tienen dueño (`ownerId` = Willy), la facción de Willy y duración (fin del combate o N turnos). El autómata lo **controla el jugador** y actúa justo después de Willy; la antena es una torreta con IA aliada. Lo que eliminan da experiencia y audiencia a Willy, y cuentan para sus logros. Fuera de combate se pliegan. Si Willy cae, desaparecen.
- **Movilidad vertical (Jugador de basket):** saltos que cruzan huecos y suben varios niveles, mates desde arriba y balón con rebote. Es la clase que más exprime la altura y los fosos. Necesita la acción genérica de salto y el trazado con rebote del motor (R15). Las plantillas marcan las salas de **techo bajo** (bodegas, alcantarillas, saunas) con `ceiling: low`.
- **Control (Funcionario):** aturdir a distancia, la superficie **expedientes** (enreda y arde) y barreras temporales. Su pasiva lo hace inmune a todo movimiento forzado, que en este juego es muy fuerte: a cambio, su horario de ventanilla le encarece todo a partir de la quinta ronda.
- **Mazmorreros rivales:** PNJ no humanos generados por partida (ver §17) con IA propia (facción `rivales`), que pueden convertirse en aliados temporales tras un pacto.
- **IA (Fase 2 del motor):** cada enemigo tiene un perfil simple en datos (`agresivo`, `a distancia`, `cobarde`, `guardián`) y **evita** casillas peligrosas para sí mismo, salvo los Bailando y los empujados. Que la IA no se suicide sola es importante: las muertes por entorno tienen que ser mérito del jugador.

## 6. Audiencia

Datos: `content/willy/data/audience.json`.

- Un **contador de espectadores** siempre visible desde el paso t03 del tutorial.
- **Sube** con lo espectacular: eliminaciones con el entorno (caídas, fuera de plano, superficies, choques, decorados), varias eliminaciones a la vez, críticos e incluso pifias, reacciones de superficies, riesgo (ganar con poca vida, salir con poco reloj), cajas de oro y legendarias, logros y «Hacer el ganso».
- «Hacer el ganso» solo da audiencia **en combate** (decisión del usuario, 2026-10-23: fuera de combate se podía farmear).
- **Baja** (en %) con lo aburrido: esperar, turnos sin efecto, repetir la misma acción 3 veces seguidas, huir, y 30 s de reloj sin nada interesante fuera de combate.
- **Novedad:** lo primero de cada tipo en la partida vale ×2; repetir lo mismo en 5 turnos baja a ×0,7, ×0,5, ×0,3.
- **Escala por planta** (×1, ×4, ×12, ×35, ×100) y **mínimo por planta**: nunca baja de ahí.
- **Nunca castiga**: no quita vida ni objetos. Da **cajas en hitos** (5 mil → bronce … 50 M → legendaria), activa a los patrocinadores (cada uno tiene una audiencia mínima para fijarse en ti), paga la **prima de fin de planta** (caja según la audiencia) y, en la Planta 5, decide los votos del público contra el Presentador y, en la Gran final, cada punto de espectáculo le vacía el **Share** (su medidor de inmortalidad).

## 7. Patrocinadores

Datos: `content/willy/data/sponsors.json`. Seis personalidades: Butanos Hermanos Pérez, Seguros La Prudente, Lord Vórtax, Mamá Clementina, La Colmena y Glorp Ecosoluciones.

- Cada uno tiene una **afinidad** de −50 a 150 que suben sus gustos y bajan sus disgustos (patrones de evento, como los logros).
- **Estados:** neutral → interesado (20, primer mensaje) → a favor (50, regalo) → fan (100, regalo grande). Cada 40 de afinidad extra, otro regalo (máximo 2 regalos por planta en total).
- **Retirada:** si la afinidad baja de −20, retira su apoyo; **siempre avisa antes** al cruzar 0. Vuelve si sube a 30. Hay logros para las dos cosas.
- Los **gustos chocan** a propósito (Butanos vs. Glorp, Prudente vs. Colmena, Clementina vs. Vórtax): no se puede contentar a todos, y eso hace que cada partida tenga una «personalidad».
- **Interfaz:** fila de retratos pequeños con un medidor; tocar uno muestra lo que le gusta y lo que no. Los mensajes llegan como un bocadillo con su color y su retrato, sin pausar el juego.
- **Regalos:** objetos de su lista o cajas, que caen en paracaídas (en combate, al final de la ronda).
- **Carisma** multiplica la afinidad ganada (+5 % por punto).
- **Contratos** (aprobados por el usuario, 2026-10-23): un patrocinador interesado ofrece un contrato concreto al llegar al Camerino o la primera vez que se interesa por Willy (datos: `sponsors.json → contratos`). Como mucho 2 a la vez. Aceptado («Firmar» en el panel de patrocinadores), dura hasta salir de la planta siguiente. Cumplido: su premio (caja, objeto o fichas) y +10 de afinidad. Roto o sin cumplir: multa en fichas, −10 de afinidad y un mensaje con retintín. Nunca quita vida ni objetos.

## 8. Cajas de botín

Datos: `content/willy/data/loot-tables.json`.

### Principios (no negociables)

1. **Solo dentro del juego.** No hay dinero real, ni tienda, ni moneda premium. **Las cajas no se compran ni siquiera con fichas**: solo se ganan jugando.
2. **Transparencia:** el nivel de la caja se ve antes de abrirla y «Ver probabilidades» muestra los porcentajes exactos de la tabla.
3. **Sin trampas psicológicas:** sin falsos «casi», sin temporizadores, sin recompensas diarias, sin notificaciones. La animación se puede acelerar y saltar. (Las «ofertas» de este punto se refieren a vender cajas; los **contratos de patrocinadores** de §7 están aprobados: decisión del usuario, 2026-10-23.)
4. **Garantía (piedad) visible:** el contador «Garantía de oro: 5/8» está en la pantalla de apertura.
5. **Deterministas:** el contenido se tira con el RNG de la partida al abrir. Recargar no cambia el resultado, así que no compensa «guardar y recargar».

### Niveles

| Caja | Objetos | Garantía | Rareza de cada objeto (bronce / plata / oro / legendaria) | Fichas |
|---|---|---|---|---|
| Bronce | 2 | — | 80 / 18 / 2 / 0 % | 5-15 |
| Plata | 3 | 1 de plata o más | 55 / 38 / 6,5 / 0,5 % | 15-30 |
| Oro | 3 | 1 de oro o más | 30 / 45 / 22 / 3 % | 30-60 |
| Legendaria | 4 | 1 legendario | 0 / 40 / 45 / 15 % | 80-150 |

### Cómo se tira una caja

1. Para cada hueco: tirar la **rareza** con los pesos de la caja; tirar la **categoría** (consumible 50, herramienta 20, equipo 22, aviso 8); tirar el **objeto** entre los de esa rareza y categoría.
2. **Garantía:** si al final ningún objeto llega a la rareza garantizada, el último hueco se vuelve a tirar forzando esa rareza.
3. **Piedad:** 8 cajas seguidas sin oro → la siguiente fuerza un objeto de oro; 20 sin legendario → uno legendario.
4. **Antifrustración:** sin repetidos en la misma caja; como mucho 2 copias de la misma herramienta o equipo por partida; los objetos únicos no se repiten; si una rareza se agota, se baja una (o se dan fichas).
5. **Desbloqueos:** solo entran en las tablas los objetos desbloqueados en este navegador (los que tienen `desbloqueo: logro:...` aparecen tras conseguir el logro).

### Fuentes de cajas

**Decisión del usuario (2026-10-23):** un logro ya conseguido en una temporada anterior (perfil del navegador) vuelve a salir en la nueva con el aviso «¡Otra vez! (sin caja: ya la ganaste)», pero no da caja otra vez.

Logros (la primera vez), hitos de audiencia, patrocinadores, jefes (plata, plata, oro, oro, legendaria), prima de fin de planta según audiencia y la prima «Al filo» (salir con menos del 10 % del reloj). Los **cofres** del mapa son otra cosa: 1 objeto + fichas, sin animación especial, y a partir de la Planta 2 alguno es un **mímico**.

### La apertura (el momento)

Pantalla completa sobre el mapa oscurecido, unos 4 s (×2 de velocidad o saltar con un toque):
1. La caja cae y rebota (sacudida de cámara pequeña); el Narrador la anuncia (banco `cajaAbrir`).
2. Toque para abrir: la caja **tiembla** con intensidad creciente según el nivel de la caja (no según el contenido: no hay falsas expectativas).
3. La tapa salta; **haz de luz** del color de la rareza más alta que salga, con partículas (confeti en bronce y plata, chispas doradas en oro, estrellas moradas y un zumbido en legendaria).
4. Las **cartas** salen en abanico boca abajo y se dan la vuelta una a una al tocarlas (o todas con «Revelar todo»). Cada carta tiene marco de su rareza, el nombre y la regla en una línea.
5. Fichas en lluvia hacia el contador; frase del Narrador (banco `cajaResultado`); botones «Equipar» y «A la mochila».
6. Accesibilidad: opción «Animaciones reducidas» (sin sacudidas ni destellos).

Piezas genéricas en el cliente (`src/fx/` y una escena de recompensa): ver `ENGINE_REQUESTS.md` → R8.

## 9. Logros

Datos: `content/willy/data/achievements.json` (**124 logros**, 23 ocultos con pista).

### Sistema

- Se guardan **por navegador**, en el perfil (no en la partida): sobreviven a partidas nuevas.
- Se evalúan sobre el **flujo de eventos** del motor y del juego. Contadores con **ámbito**: `siempre` (perfil), `partida`, `planta`, `combate`, `turno`.
- Al desbloquear: fanfarria, tarjeta con el nombre, cabecera del Narrador (banco `logroCabecera`) + **frase propia del logro** y, si la hay, **caja** (solo la primera vez), XP, cosmético o desbloqueo de un objeto en las tablas de botín.
- **Ocultos:** se ven como «???» con su pista.
- Pantalla de logros en el menú de pausa y en la de inicio: por categoría, con progreso («37/50»).

### Formato de un logro (TypeScript)

```ts
type Scope = 'siempre' | 'partida' | 'planta' | 'combate' | 'turno';

/** Filtro sobre los campos de un evento. Rutas con punto: 'actor.id', 'objetivo.faccion'. */
type Match = string | number | boolean
  | { min?: number; max?: number }       // rango numérico
  | { en: (string | number)[] }           // uno de
  | { tiene: string }                     // la lista contiene
  | { existe: boolean };
interface EventPattern { evento: string; donde?: Record<string, Match> }

type Condition =
  | { contar: EventPattern; min: number; ambito: Scope }              // nº de eventos que cumplen el patrón
  | { sumar: EventPattern; campo: string; min: number; ambito: Scope } // suma de un campo numérico
  | { al: string; si: Condition }                                       // se evalúa solo cuando ocurre ese evento
  | { dato: string; min?: number; max?: number; igual?: JsonValue }     // valor actual: 'combate.*', 'partida.*', 'perfil.*', 'willy.*'…
  | { todas: Condition[] } | { alguna: Condition[] } | { no: Condition };

type Reward =
  | { tipo: 'caja'; nivel: 'bronce' | 'plata' | 'oro' | 'legendaria' }
  | { tipo: 'xp'; cantidad: number }
  | { tipo: 'cosmetico'; item: string }
  | { tipo: 'desbloqueo'; item: string };

interface Achievement {
  id: string; nombre: string; descripcion: string;
  categoria: string; oculto: boolean; pista?: string;
  condicion: Condition;
  narrador: string;            // plantilla del Narrador
  recompensas: Reward[];
}
```

El lenguaje de condiciones y patrones es **el mismo** para logros, gustos de patrocinadores, reglas de audiencia, disparadores del tutorial y filtros del Narrador. Un solo evaluador genérico (R4).

### Vocabulario de eventos

Los del motor (existentes o previstos en las Fases 2-3: `entityMoved`, `resourceChanged`, `conditionApplied`, `combatStarted`, `combatEnded`, `turnStarted`, `turnEnded`, `attackResolved`, `checkRolled`, `entityDefeated`, `entityPushed`, `fell`, `surfaceCreated`, `surfaceReacted`, `objectDestroyed`) **con los campos que piden los logros**: `causa` (`golpe`, `caida`, `fueraDePlano`, `choque`, `superficie`, `decorado`, `trampa`, `derrumbe`), `actor`, `objetivo`, `arma`/`objeto`, `elemento`, `critico`, `natural`, `alturaRelativa`, `movidoPor` (`cinta`, `marea`…), `enemigosAfectados`.

Y los del juego (`content/willy` + ruleset): `runStarted`, `runEnded`, `floorEntered`, `floorExited`, `roomEntered`, `clockStarted`, `clockWarning`, `clockExpired`, `roomCollapsing`, `boxDelivered`, `boxOpening`, `boxOpened`, `itemObtained`, `itemUsed`, `itemEquipped`, `itemSold`, `mimicRevealed`, `trapDetected`, `trapTriggered`, `secretFound`, `audienceChanged`, `audienceMilestone`, `multiKill`, `showOff`, `sponsorMessage`, `sponsorWithdrew`, `levelUp`, `skillUsed`, `skillLevelUp`, `traitTriggered`, `safeZoneEntered`, `rested`, `gameSaved`, `npcTalked`, `characterCreated`, `achievementUnlocked`, `cinematicCompleted`, `playerIdle` (cliente).

## 10. Narrador

Datos: `content/willy/narrator/*.json` (**376 líneas** en 59 bancos). Motor de plantillas genérico: `ENGINE_REQUESTS.md` → R5.

### Formato de un banco

```json
{
  "id": "enemigoEliminado",
  "evento": "entityDefeated",
  "donde": { "objetivo.faccion": "monstruos" },
  "probabilidad": 0.55,
  "prioridad": 3,
  "memoria": 12,
  "enfriamientoTurnos": 1,
  "lineas": [
    { "id": "ee-13", "texto": "¡Y abajo! {enemigo:el:Mayus} ha descubierto la gravedad…", "si": { "causa": "caida" } }
  ]
}
```

- **Variables** `{enemigo}`, `{objeto}`, `{logro}`, `{patrocinador}`, `{dano}`, `{espectadores}`… con **filtros** de concordancia: `:el` (el/la/los/las según género y número), `:un`, `:del`, `:al`, `:o` (terminación o/a), `:Mayus`. Cada entidad u objeto declara su `genero` (`m`/`f`) en los datos.
- **Variables globales** del reparto, sacadas de `content/willy/data/cast.json`: `{presentador}`, `{presentadorCorto}`, `{presentadorApodo}`. Disponibles en todos los bancos, logros, nombres de jefes y escenas. Así el nombre del Presentador existe en **un solo sitio** (ver `STORY.md` → «El antagonista»).
- **Selección:** de las líneas cuyo `si` se cumple, se quedan **las más específicas** (más claves en `si`); se descartan las usadas en las últimas `memoria` frases del banco; se elige con el RNG del Narrador (peso opcional). Si todas se han usado, se vacía la memoria salvo la última.
- **Ritmo:** `probabilidad` de hablar; `enfriamientoTurnos`; **una frase a la vez**: si llegan varias, gana la `prioridad` mayor y el resto se descarta (salvo las de prioridad 5, que se encolan). Nunca más de una frase cada 2,5 s.
- **Determinismo:** la selección usa un RNG propio del Narrador guardado en el estado (no el del combate), así que el texto no altera las tiradas.
- **Presentación:** caja inferior con máquina de escribir y «bla-bla» sintetizado; se cierra sola (≈ 50 ms por carácter + 1,5 s) o con un toque. Historial de las últimas 50 frases en el menú de pausa.

## 11. Camerino: mercado y zona segura

Datos: `floors.json` → `camerino` y `loot-tables.json` → `mercado`.

- Mapa fijo y pequeño; el reloj no corre y no hay combate.
- **Ultramarinos Maripuri:** 4 consumibles, 1 herramienta y 2 equipos, con la rareza según la planta; más tortilla y cubo de agua siempre. Comprar al valor del objeto; vender al 40 % (el Tasador, mejor). Sin cajas en venta.
- **Bar Paco:** descansar recupera toda la vida y la energía (una vez por Camerino).
- **Producción (Xelda):** guardar («firmar el parte de planta»), reglamento, probabilidades de las cajas.
- **Koldo:** conversación nueva cada vez y una misión opcional para la planta siguiente (p. ej. «elimina a 3 enemigos con carritos» → caja de plata).
- Al salir del Camerino se autoguarda.

## 12. Progresión, eliminación y perfil por navegador

### Dentro de la partida
Niveles, atributos, ventajas y habilidades que suben con el uso: `RULESET.md`.

### Eliminación: dos modos (decisión del usuario)

El jugador elige el modo al crear la partida y **no se puede cambiar después**. Se guarda en `GameState.settings.eliminationMode` (`repeticion` | `sinRepeticion`) y lo ven los logros, el Narrador y los patrocinadores.

| | **Con repetición** (normal, por defecto) | **Sin repetición** (hardcore) |
|---|---|---|
| Si la vida llega a 0 | Escena del Narrador y vuelta al último guardado (último Camerino; en la Planta 1, el inicio de la planta tras el cásting) | Escena de cierre del Narrador y **fin de la temporada**: pantalla de resumen (planta alcanzada, audiencia máxima, patrocinadores, logros de la partida) |
| La planta | Se regenera con `intento + 1` («la mazmorra se recoloca») | — |
| Lo que se pierde | Botín y experiencia desde el guardado | La partida entera |
| Lo que se conserva | Logros y desbloqueos (perfil) | Logros y desbloqueos (perfil). El guardado se borra |
| Guardado | Manual en el Camerino (Xelda) + autoguardado de suspensión | **Una sola ranura, automática** (ver abajo) |
| Turista | Vuelves al inicio de la planta con lo que llevabas | No disponible: Sin repetición exige Concursante o Prime time |

**Guardado en Sin repetición (sin trampas):**
- Una sola ranura por navegador para la partida hardcore, separada de las partidas normales (`willy:hardcore`).
- Se guarda **automáticamente** tras cada comando que cambia el estado (y al salir de la pestaña). No hay «Guardar», ni «Cargar», ni exportar la partida en curso.
- Al pulsar «Continuar» se reanuda exactamente donde estaba: como el RNG vive en el estado, cerrar la pestaña antes de una tirada mala no cambia el resultado.
- Al morir, la ranura se borra en la misma escritura que registra el resultado en el perfil.
- La ranura lleva un contador de escrituras guardado también en el perfil. Si al cargar el contador de la ranura es menor que el del perfil (alguien ha restaurado una copia antigua desde las herramientas del navegador), la partida se marca «Repetición detectada» y pasa a Con repetición. Sin castigo, pero los logros de Sin repetición ya no cuentan. Es una medida de buena fe, no anti-trampas seria: es un juego entre amigos.

**Cómo reaccionan los demás sistemas:**
- **Logros:** «Una sola toma» (ganar Sin repetición, caja legendaria) y «Programa cancelado» (caer Sin repetición; consuelo sin premio). «Eliminado, pero poco» solo cuenta en Con repetición.
- **Narrador:** bancos propios `inicioSinRepeticion` (al empezar) y `willyEliminadoSinRepeticion` (al caer: despedida con cariño, nunca burla). El banco normal `willyEliminado` solo suena en Con repetición.
- **Audiencia:** en Sin repetición la audiencia de toda la partida vale ×1,25 (el público sabe que va en serio).
- **Perfil:** guarda la mejor planta alcanzada Sin repetición, que se ve en la pantalla de logros.

### Selector en «Nueva partida»

Tres pasos, una pantalla cada uno, todos con «Atrás»:
1. **Dificultad:** Turista / Concursante / Prime time (con una línea de explicación cada uno; «Turista» recomendado si es tu primera vez).
2. **Modo:** «Con repetición: si caes, vuelves al último Camerino» (seleccionado por defecto) / «Sin repetición: si caes, se acaba la temporada». El segundo muestra un aviso: «Una sola vida. Se guarda solo y no se puede volver atrás.» Con Turista, la opción Sin repetición sale desactivada con su motivo.
3. **Aspecto** (si hay cosméticos desbloqueados) y semilla opcional («Semilla: dejar en blanco para azar»).

Luego, el prólogo (o «¿Ver el prólogo otra vez?»).

### Perfil por navegador (meta-progresión)
En `localStorage`, separado de las partidas (ver R6):
- logros desbloqueados y contadores de ámbito `siempre`;
- **objetos desbloqueados** para las tablas de botín (vía logros);
- **cosméticos** (gorros y aspectos para Willy, se eligen en el cásting);
- estadísticas (clases jugadas y ganadas, rivales conocidos, glosario leído, prólogo visto);
- preferencias (consejos, animaciones reducidas, voz, velocidad de texto).

**Decisión del usuario: solo variedad entre partidas, nunca poder permanente.** Los desbloqueos amplían las tablas de botín y el armario de cosméticos; no hay mejoras de atributos, vida ni reloj que se arrastren. Así una partida nueva es justa y el juego sigue siendo de habilidad.

Exportar e importar el perfil junto con las partidas (JSON), como ya hace el guardado.

## 13. Introducción y onboarding

Público: amigos que no conocen el proyecto ni el LitRPG. Tienen que entender y jugar sin que nadie les explique nada.

| Pieza | Cómo es en *Willy* |
|---|---|
| **Enlace compartible** | La URL de GitHub Pages (`/willysGate/willy/`) abre directamente en la pantalla de inicio. Cada amigo tiene su guardado y su perfil en su navegador. |
| **Pantalla de inicio** | Título, subtítulo con gancho («Se acabó el mundo y lo están echando por la tele»), botón grande **«Nueva partida»**, «Continuar» (si hay guardado; dos si hay partida normal y Sin repetición), **«Cómo se juega»** (siempre visible), «Logros», «Ver el prólogo» y «Opciones». |
| **Prólogo** | [`INTRO.md`](INTRO.md): 16 viñetas, 1:48, saltable desde el primer segundo y repetible. Ya ilustrado por la sesión de arte (`content/willy/cinematics/`). |
| **Tutorial integrado** | Planta 1, `content/willy/tutorial.json`: 28 pasos (abajo). |
| **Cómo se juega** | 9 páginas cortas (`texts/como-se-juega.json`), cada una cabe en un móvil. |
| **Glosario** | Menú de pausa (`texts/glossary.json`): básico, personaje, entorno, el concurso (audiencia, patrocinadores, reloj, derrumbe), cajas y estados. Los mismos textos son los **tooltips**: cualquier número de un desglose enlaza a su término. |
| **Consejos** | Los pasos del tutorial y los avisos del Narrador se pueden desactivar en Opciones (preferencia del navegador). |
| **Feedback** | **Sin botón por ahora (decisión del usuario).** No se publica ningún correo ni formulario. TODO: si más adelante se quiere, `GameDefinition.feedbackUrl` opcional; si no está definido, el botón no aparece. |
| **Dificultad y modo** | Turista / Concursante / Prime time y Con repetición / Sin repetición, elegidos al pulsar «Nueva partida» (ver §12, «Selector»). |
| **Tipografía** | **Press Start 2P** para títulos, rótulos del programa, carteles, la tarjeta de logro y la apertura de cajas. **VT323** para diálogos, el Narrador, tooltips, glosario y menús con texto largo (más legible en móvil). |

### Secuencia del tutorial (Planta 1)

Regla: **ningún sistema aparece sin haberse explicado antes**. Lo no explicado está apagado (`tutorial.json` → `bloqueosIniciales`): el HUD de audiencia, reloj, atributos y mochila están ocultos; no hay reloj, patrocinadores, cajas, trampas ni cofres hasta su paso.

| # | Dónde | Qué se explica | Disparador |
|---|---|---|---|
| 1-2 | Calle de Willy (fija) | Moverse y la cámara | Entrar en la planta |
| 3 | Plaza | **Audiencia** (aparece el contador) | Llegar a la plaza |
| 4-5 | Plaza | **Cásting** (clase; Willy siempre es humano) y **atributos** / % de acierto | Tras la audiencia |
| 6-9 | Sala de tutorial (fija): 2 ratas, un muelle | **Turnos**, **atacar**, **empujar**, **altura y caídas** | Primer combate, rata al borde del muelle |
| 10 | — | **Primer logro** («Por favor, circule» o «Primer figurante», garantizado aquí) | Primer logro |
| 11-12 | — | **Primera caja** (guionizada: mechero + tirita) y **mochila** | Recompensa del logro |
| 13 | Callejón del aceite (primera sala procedural, forzada con aceite y bocartes) | **Superficies** (aceite + mechero) | Turno con el mechero y enemigos sobre aceite |
| 14 | — | **Primer patrocinador** (Butanos Pérez, guionizado) | Reacción de superficie |
| 15 | Salida del tutorial | **Reloj** (aparece y empieza a correr) y trampas y cofres activados | Marcador de fin de tutorial |
| 16-27 | Resto de la planta | Subir de nivel, habilidades, estados, curarse, trampas, cofres, aburrimiento, aviso del reloj, jefe, Camerino, glosario, ayuda si te atascas | La primera vez que ocurre cada cosa |

Todos los textos van con la voz del Narrador: sarcástico, breve, nunca un manual.

**Antes de dar por buena una versión jugable:** revisión como jugador nuevo (alguien que no conoce el proyecto ni el LitRPG) y lista de cada punto en el que se pierde.

## 14. Arte y sonido

- **Tamaño de tile:** 16 px, como *Intereses*: mismo render, mismos pipelines.
- **Base: Ninja Adventure** (CC0, ya en `art-src/ninja-adventure/`): personajes en 4 direcciones con ataque, cientos de monstruos, efectos, **música y sonido** (resuelve el audio a coste cero). Muy luminoso: encaja con el tono.
- **Complemento: 0x72 DungeonTileset II** (CC0): muros de mazmorra, cofres, trampas y el mímico (con un filtro de color más alegre).
- **Kenney** (CC0): iconos de interfaz, objetos sueltos y placeholders.
- **Decisión del usuario: no se compra arte.** Nada de LimeZu ni de Tiny Swords Enemy Pack. Lo que falte lo hace **la sesión de arte** de forma propia (recolores, piezas y dibujos a 16 px con pipelines reproducibles en `scripts/art/`).
- **Sprites:** 2 direcciones con volteo como mínimo; Ninja Adventure trae 4, que se usarán.
- **Falta (anotar en `TODO-ART.md` cuando se integre):**
  - Willy con mono naranja y bombona: recolor de un personaje de Ninja Adventure (pipeline de paletas, Fase 2 del motor) y la bombona como sprite propio.
  - Willy humano con una variante visible por clase (9).
  - Los 5 mazmorreros rivales (gaviota, gnomo, orco, fantasma, minotauro) como PNJ.
  - El encargo concreto a la sesión de arte está en `ART_BRIEF.md`.
  - Jefes grandes (Centollo, Gigantón, Socorrista): no existen a 16 px; escalar monstruos ×2 con retoque o dibujarlos.
  - Biomas modernos (hipermercado, verbena, balneario, plató): tiles propios de la sesión de arte, partiendo de Ninja Adventure (interiores) y Kenney.
  - Ingeniero: Autómata repetidor (2 direcciones, idle y golpe) y Antena repetidora, propios; arco voltaico y las ondas de la habilidad G (más vistosas por nivel, de un pitido triste en 5G a un estallido de pantalla en 10G) como partículas.
  - Funcionario: impresos voladores, superficie de expedientes (y su versión en llamas), persiana de ventanilla.
  - Jugador de basket: balón, animación de salto por código (arco y sombra), Chencho el base (recolor de un personaje de Ninja Adventure).
  - Retratos de los 6 patrocinadores y 4 PNJ del Camerino (32×32).
  - Cajas de botín de 4 niveles con animación y cartas de rareza.
  - Viñetas del prólogo: **hechas** por la sesión de arte.

## 15. `GameDefinition` prevista

No se crea `content/willy/game.ts` hasta que exista `rulesets/willy/` (si no, el build intentaría compilar y desplegar el juego). Lo previsto:

```ts
export const game: GameDefinition = {
  id: 'willy',
  title: 'Willy el mazmorrero',
  ruleset: willy,                                   // rulesets/willy
  art: { default: 'ninja', presets: { ninja: artNinja } },
  texts,                                            // texts/ui.json
  theme: {
    colors: { bg: '#1b1530', panel: '#2a2147', text: '#fff4e0', accent: '#ff7a1a', muted: '#a99cc7', error: '#ff5577', … },
    canvas: '#1b1530',
    fontFamily: "'VT323', monospace",                 // diálogos, Narrador, menús
    titleFontFamily: "'Press Start 2P', monospace",   // títulos y rótulos del programa (campo nuevo, R9)
    fontUrl: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap',
  },
  playerId: 'player:1',
  leaderId: 'willy',
  // feedbackUrl: sin definir (decisión del usuario): no hay botón de feedback.
  // Nuevos campos que dependen de ENGINE_REQUESTS:
  data: { floors, items, lootTables, achievements, sponsors, audience },
  narrator: [combate, logrosYCajas, plantas, miscelanea],
  tutorial, glossary, howToPlay,
  cinematics: { intro },                            // content/willy/cinematics (sesión de arte)
  saveMode: 'checkpoint',                           // guardar solo en el Camerino; 'permadeath' si Sin repetición
  newGame(engine, seed, options) {
    // options: dificultad, modo de eliminación y cosmético elegidos.
    // 1. Estado con Willy (castreño por defecto hasta el cásting) en la calle fija de la Planta 1.
    // 2. Sistemas: clock, meters (audiencia + 6 patrocinadores), narrator, lootPity, run.
  },
};
```

## 16. Plan por fases

Cada fase termina con la aprobación del usuario. **Dep.** indica lo que necesita de la sesión principal.

| Fase | Contenido | Dep. |
|---|---|---|
| **W0. Diseño** (hecha) | Historia, prólogo, reglas, datos (Willy humano, 9 clases, 5 rivales, 93 objetos, tablas, 131 logros, patrocinadores, audiencia, plantas, tutorial, glosario, 376 frases del Narrador), peticiones al motor | — |
| **W1. Esqueleto** | `rulesets/willy` (atributos, d20, recursos, condiciones, tests); `game.ts`; preset de arte `ninja`; la calle fija de la Planta 1 jugable con movimiento | Fase 2 del motor (ganchos de turno, `preview`) |
| **W2. Combate y entorno** | Ataque, empujar, caídas, superficies, 4 enemigos de la Planta 1, IA, sala de tutorial, invocaciones (Ingeniero, Basket), salto y rebote del balón | Fases 2 y 3 del motor (combate, superficies, empujar, caídas); R13 (`spawnEntity`); R15 (salto y rebote) |
| **W3. Procedural** | Generador (R1) + 12 plantillas de Castro + validación con 500 semillas; reloj (R2) y derrumbe | R1, R2, R3 |
| **W4. Concurso** | Audiencia y patrocinadores (R3), Narrador (R5), cajas de botín y su apertura (R8), inventario (R7) | R3, R5, R7, R8 |
| **W5. Logros y perfil** | Evaluador (R4), perfil por navegador (R6), pantalla de logros | R4, R6 |
| **W6. Onboarding** | Pantalla de inicio, prólogo, tutorial completo, glosario, Cómo se juega, feedback. **Versión jugable de la Planta 1 + Camerino para compartir con amigos.** | R9 (escenas de inicio y prólogo) |
| **W7. Plantas 2-5** | Biomas, mecánicas, jefes, 48 plantillas más, escenas fijas, final | Arte de biomas |
| **W8. Pulido** | Balance, sonido, partículas, accesibilidad, revisión como jugador nuevo | Fase 6 del motor (FX) |

La primera versión que se puede enseñar a amigos llega al cerrar **W6** (Planta 1 completa con tutorial y el primer Camerino).

## 17. Mazmorreros rivales procedurales

Decisión del usuario: los rivales no son fijos ni se repiten. Datos: `content/willy/data/rival-generator.json` (tablas) y `rivals.json` (5 legendarios escritos a mano).

### Cuándo aparece uno

- Al generar cada planta, con probabilidad `probabilidadSalaRival` (Planta 1: 50 %, después del tutorial; resto: 80 %) una sala procedural recibe el rol `rival`. Como mucho una por planta.
- Si hay un rival anterior de esta partida al que se pactó o se dejó ir, con un 40 % la sala es para él (**vuelve**, con memoria del desenlace). Los derrotados no vuelven.
- Si no, con un 6 % es un **legendario** que no haya salido en esta partida ni en la anterior; si no, uno **generado**.

### Cómo se genera

Todo con `deriveSeed(semillaPartida, 'rival', planta, ranura)` (R12), nunca `Math.random`: la misma semilla da los mismos rivales. Pasos:

1. **Raza** (5) y **género** (m/f).
2. **Identidad:** nombre (40 por género) + apellido (40), pueblo de origen (30), oficio de antes (25, con forma masculina y femenina).
3. **Apodo** por plantilla («{art} {adj}», «{art} de {lugar}», «{art} {oficio}», «{art} que {verbo}», «{art} {adj} de {lugar}»).
4. **Personalidad** (12, cada una con 3 coletillas), **manía** (25) y **gancho de historia** (15).
5. **Aspecto:** paleta de su raza (5 por raza) + accesorio de cabeza (12), cara (8) y mano (10). Lo usa el arte modular.
6. **Kit** (6) con estadísticas escaladas por planta, más los rasgos de la raza.
7. **Comportamiento** (6): agresivo, codicioso, cobarde, propenso a aliarse, fanfarrón o tramposo. Fija la IA, la DIF del pacto y la probabilidad de traición.
8. **Frases:** plantillas por momento (presentación, amenaza, pacto, derrota, huida, vuelta tras pacto, vuelta tras huida, traición) con variables del rival y coletillas de su personalidad, con el motor de plantillas del Narrador (R5).

**Unicidad:** dentro de la partida no se repiten nombre+apellido, apodo, la terna raza+kit+comportamiento, la manía ni el gancho. Entre partidas, se excluyen los nombre+apellido de los últimos 40 rivales del perfil del navegador (`rivalesRecientes`, R6), que se copian al `GameState` al empezar para que la generación siga siendo reproducible. Si algo choca, se vuelve a tirar solo ese campo (hasta 30 veces).

**Tamaño:** 12 millones de identidades (raza × nombre × apellido × pueblo × oficio); con personalidad, manía, kit y comportamiento, unos 130 000 millones de combinaciones; 4 800 aspectos distintos.

### Estado

`state.systems.rivals`: lista de los rivales de la partida (semilla de cada uno, no el texto: se regenera igual), con `desenlace` (`derrotado` | `pacto` | `huida`), plantas en que ha salido y si ha traicionado. El texto y las estadísticas se derivan de la semilla y la planta.

### Logros y Narrador

- Banco `rivalAparece` (plantas.json): presentaciones de los 5 legendarios y 9 plantillas para generados (por comportamiento), más vueltas, alianza y traición.
- Logros: «Competencia directa», «Alianza estratégica», «Fauna local» (un rival de cada raza), «Agenda de contactos» (6 rivales distintos en una partida), «Viejos conocidos» (vuelve como aliado), «La letra pequeña del pacto» (traición, oculto) y «Edición limitada» (legendario, oculto).
