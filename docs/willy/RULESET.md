# Ruleset `willy`: el Reglamento del Concurso

> Estado: **propuesta pendiente de aprobación** (Fase 0 de *Willy*, 2026-10-17).
> Willy es **siempre humano** (rasgos fijos en `rulesets/willy/data/willy.json`). Clases (9, incluidas las especiales **Ingeniero**, **Funcionario** y **Jugador de basket**) en `classes.json`. Las razas no humanas son ahora mazmorreros rivales (PNJ) en `rivals.json`. Objetos en `items.json`.
> Estado tras la revisión del usuario (2026-10-17): **aprobado**; se añaden las clases Ingeniero (con la habilidad 5G→10G), Funcionario y Jugador de basket, y los modos de eliminación.

## Objetivos

1. **Números a la vista.** Todo lo que importa se ve: atributos, daño, % de acierto, nivel de cada habilidad. Es un LitRPG: los números son parte de la gracia.
2. **Subir de nivel a menudo.** El primer nivel llega en los primeros 5 minutos; luego, unos dos por planta.
3. **Habilidades que mejoran con el uso.** Usar algo lo hace mejor, y el juego lo celebra.
4. **Que lo entienda alguien que nunca ha jugado a rol.** Una sola regla para casi todo: **d20 + atributo contra un número**.
5. **Distinto de 5e.** Sin ventaja/desventaja, sin modificadores de atributo, sin espacios de conjuro, sin ataques de oportunidad por defecto.

## Por qué un ruleset propio y no `extendRuleset(dnd5e)`

- 5e esconde los números detrás de modificadores (un 14 da +2) y de la ventaja; aquí queremos que el número que ves sea el que sumas.
- La progresión de 5e (niveles lentos, conjuros por descanso) no encaja con un roguelite de plantas cortas.
- Lo que sí se reutiliza: la convención d20 de `rulesets/common/d20.ts` (tirar un d20 y sumar), si su API lo permite sin arrastrar la ventaja.
- El ruleset implementa la interfaz `Ruleset` de `engine/ruleset.ts` y no necesita nada de `rulesets/dnd5e/`.

## La regla única

> **Tira un d20, suma el atributo (y los bonos que veas en pantalla). Si igualas o superas el número objetivo, lo consigues.**

| Situación | Tirada | Contra |
|---|---|---|
| Atacar cuerpo a cuerpo | d20 + FUE | Defensa del objetivo |
| Atacar a distancia | d20 + AGI | Defensa del objetivo |
| Prueba (trepar, forzar, convencer…) | d20 + atributo | Dificultad (DIF) |
| Resistir algo (veneno, miedo, empujón) | d20 + atributo | DIF del efecto |

- **20 natural: ¡CRÍTICO!** Daño doble, el Narrador grita y el público se anima.
- **1 natural: pifia.** Fallas, y pasa algo ligeramente ridículo (tabla de pifias en `DESIGN.md`). Al público también le gusta.
- **Antes de tirar se muestra el %**, calculado sin consumir el RNG (vista previa de `DESIGN.md` del motor, Fase 2).

### Dificultades

| DIF | Nombre | Con atributo 6 |
|---|---|---|
| 10 | Trivial | 85 % |
| 13 | Fácil | 70 % |
| 16 | Normal | 55 % |
| 20 | Difícil | 35 % |
| 25 | Heroica | 10 % |

### Bonos situacionales (siempre números fijos y visibles)

| Situación | Bono |
|---|---|
| Atacar desde más altura | +2 por nivel de diferencia (máx. +4) |
| Flanquear (un aliado al otro lado del objetivo) | +2 |
| Objetivo Tumbado | +3 cuerpo a cuerpo, −2 a distancia |
| Objetivo a oscuras (luz < 0,25) | −2 |
| Cobertura parcial / total | −2 / −5 |
| Bajo un foco (Planta 5) | +2 a atacar **y** +2 a que te ataquen |

## Atributos

Seis, con valores visibles que empiezan entre 3 y 9 y llegan a 15-20 al final del juego.

| Id | Nombre | Para qué sirve |
|---|---|---|
| `fue` | **Fuerza** | Atacar cuerpo a cuerpo, daño cuerpo a cuerpo, empujar, resistir empujones |
| `agi` | **Agilidad** | Atacar a distancia, Defensa, movimiento, iniciativa, no resbalar |
| `man` | **Maña** | Energía máxima, trampas, cerraduras, potencia de las habilidades técnicas |
| `agu` | **Aguante** | Vida, resistir veneno, fuego y frío |
| `car` | **Carisma** | Audiencia ganada, afinidad con los patrocinadores, precios, diálogos |
| `sue` | **Suerte** | Pruebas de suerte (tómbola), probabilidad de pifia enemiga, botín de enemigos |

**Valores de partida:** 5 en todo, +1 en todo por ser castreño, más los de la clase, más **3 puntos libres** al crear el personaje (o «Que elija el Narrador», que reparte por ti).

### Willy, humano de Castro

No hay elección de raza: el personaje del jugador siempre es Willy, humano.

| Rasgo | Tipo | Efecto |
|---|---|---|
| Castreño de pura cepa | Atributos | +1 a los seis atributos |
| Terco como una mula | Ventaja | Inmune a Asustado |
| Hijo del Cantábrico | Ventaja | El agua no le frena; Empapado no le hace daño doble de rayo |
| Hablar del tiempo | Desventaja cómica | En el primer combate de cada planta pierde 1 acción comentando lo raro que está el tiempo aquí abajo |

Las otras cinco razas (semigaviota, gnomo de jardín, orco de oficina, fantasma en prácticas y minotauro vegano) son ahora la base de los **mazmorreros rivales**: PNJ generados por partida (`rival-generator.json`) o legendarios escritos a mano (`rivals.json`). Usan las mismas reglas que cualquier entidad, con los rasgos de su raza, un kit de combate (pegón, tirador, trampero, tanque, curandero, ladrón) escalado por planta y un comportamiento que fija la DIF para pactar (8-18). Ver `DESIGN.md` → «Mazmorreros rivales procedurales».

### Valores derivados

| Derivado | Fórmula | Willy típico a nivel 1 |
|---|---|---|
| Vida máxima (PV) | 10 + 2 × AGU + 3 × (nivel − 1) + bonos | 24 |
| Defensa (DEF) | 10 + ⌊AGI / 2⌋ + armadura | 13 |
| Movimiento | 4 + ⌊AGI / 4⌋ casillas | 5 |
| Energía máxima | 3 + ⌊MAÑ / 3⌋ | 5 |
| Bono de daño | ⌊FUE / 3⌋ cuerpo a cuerpo, ⌊AGI / 3⌋ a distancia | +2 |
| Iniciativa | d20 + AGI | — |

## Recursos (registrados en el motor)

| Id | Nombre | Recarga (`ResourceDef.refresh`) | Barra | Notas |
|---|---|---|---|---|
| `vida` | Vida | `longRest` (descanso en el Bar Paco) | Sí | Subir de nivel recupera el 25 % |
| `energia` | Energía | `shortRest` (al acabar cada combate) | Sí | Las habilidades cuestan 1-3. Subir de nivel la llena |
| `acciones` | Acciones | `turn` (2 por turno) | No (puntos) | Atacar, usar objeto o habilidad: 1-2 |
| `movimiento` | Movimiento | `turn` | No | Casillas por turno; «Correr» gasta 1 acción por otro tanto |
| `fichas` | Fichas | `never` | Sí (contador) | Moneda del concurso. Máximo 99 999 |

- **El «descanso corto» es el final de cada combate** (el ruleset lo dispara al recibir `combatEnded`). El «largo», descansar en el Camerino.
- La **audiencia**, la **afinidad de patrocinadores** y el **reloj de planta** no son recursos de entidad: son sistemas del estado (ver `DESIGN.md` y `ENGINE_REQUESTS.md`).
- **XP y nivel** son stats (`xp`, `nivel`), no recursos: no se gastan.

## Combate

- **Iniciativa individual:** d20 + AGI al empezar el combate; empates a favor de Willy.
- **Turno:** 2 acciones + el movimiento. Mover se puede partir antes y después de actuar.
- **Sin ataques de oportunidad** por defecto: moverse junto a un enemigo es libre. Algunos enemigos tienen el rasgo **Guardia** y sí golpean al que se aleja (se marca con un escudo sobre su cabeza). Así el empujón y el reposicionamiento, que es lo que da espectáculo, son baratos.
- **Daño:** dados del arma + bono de daño. Se muestra el rango antes de atacar («4-9»).

### Acciones básicas (todo el mundo)

| Acción | Coste | Efecto |
|---|---|---|
| Atacar | 1 | Con el arma equipada |
| **Empujar** | 1 | d20 + FUE contra DIF 8 + FUE del objetivo. Si acierta, lo mueve 1 casilla. Los grandes (`size:grande`) necesitan habilidad o +5 |
| Lanzar objeto | 1 | Alcance 4. Lo que haga el objeto (frascos, bombonas, un pez) |
| Usar objeto | 1 | Consumibles. Algunos son gratis (café) |
| Correr | 1 | Otro movimiento completo |
| Esperar | 0 | Acaba el turno. **Al público no le gusta.** |
| Hacer el ganso | 1 | Baile, pose o burla. Nada útil, +audiencia pequeña (con rendimiento decreciente) |

### Empujones, choques y caídas

El público premia matar con el entorno, así que estas reglas son generosas y claras:

| Resultado de un empujón | Efecto |
|---|---|
| Choca con un muro u objeto sólido | 1d6 de golpe |
| Choca con otra criatura | 1d4 a las dos y la segunda también puede moverse si es más pequeña («¡Strike!») |
| Cae un desnivel | Ver caídas |
| Cae a un foso o al vacío | **Fuera de plano:** enemigo normal eliminado al instante. Los jefes no caen (anclados) y reciben el 20 % de su vida |
| Entra en una superficie | Sufre su efecto al momento |

**Caídas:** bajar 1 nivel no hace daño; 2 niveles, 1d6; cada nivel extra, +1d6. Quien cae queda **Tumbado**.

### Superficies (motor, Fase 3; datos del ruleset)

| Superficie | Al entrar o empezar el turno dentro | Reacciona con |
|---|---|---|
| Agua | Empapado | Rayo → electrificada; frío → hielo; fuego → vapor |
| Aceite | Prueba AGI DIF 13 o Tumbado | Fuego → llamas grandes (3 turnos) |
| Fuego | Ardiendo | Agua → vapor; se apaga solo en 3 turnos |
| Hielo | Te deslizas 1 casilla más en la dirección en que ibas | Fuego → agua |
| Vapor | Tapa la línea de visión | Frío → agua; se disipa en 2 turnos |
| Tóxico | Envenenado | Fuego → nube tóxica que arde |
| Electrificada | Electrocutado | Se apaga en 1 turno |
| Canicas | Prueba AGI DIF 13 o Tumbado | — |
| Red | Enredado | Fuego → desaparece |
| Expedientes (Funcionario) | Enredado | Fuego → llamas grandes 2 turnos; agua → desaparecen |
| Cinta (Planta 2) | Te mueve 1 casilla al final de cada ronda | — (es terreno, no superficie) |

### Condiciones

| Id | Nombre | Efecto |
|---|---|---|
| `ardiendo` | Ardiendo | 1d4 de fuego al empezar el turno. Agua lo apaga |
| `empapado` | Empapado | Rayo hace el doble; inmune a Ardiendo; con frío, Congelado |
| `congelado` | Congelado | No puede moverse; recibe +2 de daño de golpe |
| `electrocutado` | Electrocutado | Pierde 1 acción el próximo turno |
| `envenenado` | Envenenado | 1 de daño por turno durante 3 turnos |
| `tumbado` | Tumbado | Levantarse cuesta la mitad del movimiento; +3 a que le peguen cuerpo a cuerpo |
| `aturdido` | Aturdido | Pierde el turno |
| `asustado` | Asustado | Debe alejarse de quien le asustó; no puede acercarse |
| `cegado` | Cegado | −5 a atacar |
| `enredado` | Enredado | No puede moverse hasta superar FUE DIF 13 (1 acción) |
| `bailando` | Bailando | Se mueve 1 casilla al azar al empezar su turno (¡incluso a un foso!) |
| `mareado` | Mareado | −2 a todo |
| `escondido` | Escondido | Los enemigos no le eligen como objetivo; se pierde al atacar |
| `animado` | Animado | +1 al daño |
| `dormido` | Dormido | Pierde el turno; se despierta si recibe daño |
| `petrificado` | Petrificado | No actúa ni recibe daño |
| `compulsado` | Compulsado | +2 a todas las tiradas e inmune a Aturdido (Sello oficial) |
| `afortunado` | Afortunado | La próxima tirada: 2d20 y te quedas el mejor (solo objetos y ventajas raras) |

## Progresión

### Experiencia y niveles

| Fuente de XP | Cantidad |
|---|---|
| Enemigo normal / élite / jefe | 10-20 / 40 / 150 |
| Matar con el entorno (caída, superficie, fuera de plano) | +50 % de la XP del enemigo |
| Primera vez que haces algo nuevo (primer empujón, primer crítico…) | 15 |
| Logro desbloqueado | 25-100 |
| Planta superada | 100 × número de planta |
| Hito de audiencia | 30 |

| Nivel | XP total | Cuándo debería llegar |
|---|---|---|
| 2 | 60 | Primer combate de la Planta 1 |
| 3 | 160 | Mitad de la Planta 1 |
| 4 | 320 | Jefe de la Planta 1 |
| 5 | 550 | Mitad de la Planta 2 |
| 6 | 850 | Final de la Planta 2 |
| 7 | 1 250 | Mitad de la Planta 3 |
| 8 | 1 750 | Final de la Planta 3 |
| 9 | 2 350 | Mitad de la Planta 4 |
| 10 | 3 050 | Final de la Planta 4 |
| 11 | 3 900 | Mitad de la Planta 5 |
| 12 | 4 900 | Jefe final (tope) |

### Qué da cada nivel

- **Siempre:** +3 de vida máxima, **+2 puntos de atributo** (o «Que elija el Narrador»), recuperas el 25 % de la vida y toda la energía. Pantalla «¡SUBES DE NIVEL!» con números grandes, sonido y frase del Narrador.
- **Niveles pares:** eliges **1 de 3 ventajas** (perks) sacadas del mazo de tu clase, de los rasgos de Willy (`willy.json` → `ventajasDeOrigen`) y uno general, con el RNG de la partida.
- **Niveles 3, 6 y 9:** nueva habilidad de clase.

### Habilidades que suben con el uso

Cada habilidad activa (y algunas pasivas) tiene **nivel de habilidad 1-5**, independiente del nivel del personaje.

| Nivel de habilidad | Usos con efecto acumulados | Qué gana |
|---|---|---|
| 1 | 0 | Base |
| 2 | 8 | +números (daño, alcance o duración) |
| 3 | 24 | **Añadido** (un efecto extra que cambia cómo se usa) |
| 4 | 48 | +números |
| 5 | 80 | **Maestría** (efecto vistoso; el Narrador lo anuncia) |

Umbrales ajustados para la temporada de 10 pisos (2026-10-18): quien reparte el juego entre sus tres habilidades principales llega a la maestría hacia el jefe final (`BALANCE.md` → «Curva de habilidades»). La ficha y la ayuda de cada habilidad muestran «Nivel N · usos X/Y». Al subir de nivel, el evento `skillLevelUp { entityId, habilidad, nombre, nivel, maestria }` da frase del Narrador y aviso en pantalla (grande en la maestría).

- «Uso con efecto» significa que hizo algo: un Empujón que movió a alguien, un Lanzar que acertó. Spamear contra la pared no cuenta.
- Las **básicas** también suben: **Empujar** (nivel 3: empuja 2 casillas; 5: empuja en línea a dos enemigos), **Lanzar** (3: alcance +2; 5: rebota a un segundo objetivo), **Esquivar** (pasiva, sube cuando un enemigo falla: +1 DEF por nivel), **Trepar** (3: subir 2 niveles; 5: sin coste extra) y **Comer en combate** (3: comer es gratis una vez por turno; 5: la comida cura el doble). Datos en `classes.json` → `habilidadesBasicas`.
- Los niveles de habilidad viven en la entidad como stats con espacio de nombres: `skill:empujar` (nivel) y `skillxp:empujar` (usos).

## Clases de un vistazo

| Clase | Atributos | Papel | Desventaja cómica |
|---|---|---|---|
| Butanero | +2 FUE, +1 AGU | Explosiones y cargas | La bombona de la espalda puede explotar con el fuego |
| Influencer de mazmorra | +3 CAR, +1 AGI, −1 AGU | Audiencia, cegar, invocar fans | Bajón si la audiencia cae del mínimo |
| Bardo de verbena | +2 CAR, +1 MAÑ | Controlar el movimiento enemigo (Bailando) | Repetir canción aburre |
| Socorrista | +2 AGU, +1 AGI | Arrastrar, agua, curar | Se duerme si no se mueve |
| Tasador de antigüedades | +2 MAÑ, +1 SUE, +1 CAR, −1 FUE | Críticos, botín, mercado | Romper decorado le da pena |
| Mimo táctico | +2 AGI, +1 MAÑ, −1 CAR | Paredes, atraer, encerrar | Solo gestos en los diálogos |
| **Ingeniero** | +3 MAÑ, +1 AGU, −1 CAR | **Invocador**: autómatas, antena-torreta, arco voltaico y la habilidad G (5G→10G) | **Cobertura irregular**: salas sin cobertura donde la G cuesta más y sube más despacio; Mamá Clementina desconfía de él |
| **Funcionario** | +2 MAÑ, +1 AGU, +1 CAR, −1 AGI | **Control**: aturdir con papeleo, superficie de expedientes, barreras, inamovible | **Horario de atención al público**: desde la 5.ª ronda todo le cuesta más y no hay pausa del café |
| **Jugador de basket** | +2 AGI, +1 FUE, −1 MAÑ | **Movilidad vertical**: saltos, mates desde arriba, balón que rebota, alley-oop | **Cosas redondas y techos bajos**: tira a canasta a lo redondo sin querer; no salta en salas de techo bajo |

### Ingeniero: la habilidad «G» (5G → 10G)

- **Visible desde el principio** como «5G», con su texto («No hace nada»): el nombre está ahí para tentar al jugador.
- **Primer uso:** no pasa nada y el Narrador suelta su chiste, solo esa vez: «¡Ya sabíamos que el 5G no servía para nada! A lo mejor si lo subes a 6G…» (banco `redG`, línea `g5-01`).
- **Usos siguientes a 5G:** nada, en silencio. Como mucho, muy de vez en cuando, una frase de tres palabras que no se repite en la partida (banco `redG5Repetido`).
- A nivel 5G **no hace nada** (1 acción, 0 energía). Es intencionado.
- **Sube con el uso**, con umbrales propios y **6 niveles** (excepción a la regla general de 5): cuenta cada uso en combate, como mucho uno por turno, **aunque no haga nada**. En salas sin cobertura cuenta medio uso.

| Nivel | Usos | Nombre | Coste | Efecto |
|---|---|---|---|---|
| 1 | 0 | 5G | 1 acción | Nada |
| 2 | 6 | 6G | 1 acción, 1 energía | «Se le cuelga el vídeo»: un enemigo a 4 casillas, Mareado 1 turno |
| 3 | 16 | 7G | 1 acción, 1 energía | «Latencia cero»: Willy y sus autómatas +1 movimiento y +1 a acertar 2 turnos |
| 4 | 30 | 8G | 1 acción, 2 energía | «Actualización obligatoria»: enemigos en radio 3 Aturdidos 1 turno (jefes: −1 acción) |
| 5 | 50 | 9G | 2 acciones, 3 energía | «Cobertura interplanetaria»: toda la sala, 2d6 de rayo y Electrocutados; autómatas a tope de vida |
| 6 | 75 | 10G | 2 acciones, 4 energía, una vez por planta | «Señal absoluta»: enemigos no jefes Electrocutados y Bailando 3 turnos; jefes −25 % de vida máxima; un patrocinador al azar se hace fan; +60 s de reloj; el Narrador pierde la conexión una frase |

Con un uso por turno, 6G llega en el primer combate largo, 8G hacia la Planta 2 y 10G hacia la Planta 4 si se usa a menudo. Hay un logro por nivel (de «¿Y esto qué hace?» a «Cobertura total: 10G»).

Datos: `classes.json` → `ingeniero` → habilidad `red-g` (`subidaPorUso`, `nombresPorNivel`, `niveles`, `primerUso`). La interfaz muestra el nombre del nivel actual (5G, 6G…), leído de los datos.

### Ingeniero: reglas de las invocaciones

- **Autómata repetidor** (nivel 1): vida 10, DEF 12, ataque +4, 1d6, movimiento 4. Máximo 1 (2 con la habilidad a nivel 3). Lo controla el jugador y actúa justo después de Willy, con su propio movimiento y 1 acción. Dura hasta el final del combate.
- **Señal:** a más de 4 casillas de Willy (6 con la Antena plegable) queda Mareado (−2 a todo).
- **Antena repetidora** (nivel 6): torreta inmóvil 3 turnos con IA aliada; lanza un Arco voltaico gratis al empezar el turno de Willy.
- Lo que eliminan las invocaciones da XP y audiencia a Willy. Las invocaciones no ganan XP ni suben de nivel; la que sube es la habilidad que las crea (por uso).
- Si Willy cae o termina el combate, desaparecen (el autómata «se pliega»).
- Implementación: efecto `spawnEntity` del motor (`ENGINE_REQUESTS.md` → R13) con dueño, controlador, facción, duración y perfil de IA.

### Funcionario: reglas propias

- **Vuelva usted mañana:** el objetivo hace una salvación de AGU contra 10 + MAÑ del Funcionario ÷ 2; si falla, Aturdido 1 turno. Los jefes no se aturden: pierden 1 acción.
- **Expedientes** (superficie nueva): quien entra o empieza el turno dentro queda Enredado. Con fuego: llamas grandes 2 turnos (como el aceite). Con agua: desaparecen (papel mojado).
- **Plaza en propiedad** (pasiva): inmune a todo movimiento forzado (empujones, cintas, mareas, Bailando, arrastres). Emite `forcedMoveResisted` para el Narrador y el logro «Inamovible».
- **Compulsado** (condición nueva): +2 a todas las tiradas e inmune a Aturdido.
- **Ventanilla cerrada:** una barrera temporal de 3 casillas (entidad-objeto creada con `spawnEntity`, como la pared del Mimo).
- **Horario de atención al público:** desde la ronda 5 de cada combate, +1 de energía a todas sus habilidades y sin Pausa del café; fuera de combate, +1 s de reloj por interacción.

### Jugador de basket: reglas del salto

- **Salto** (acción `jump`, nueva en el motor: `ENGINE_REQUESTS.md` → R15): mueve en línea recta hasta N casillas **ignorando lo que hay en medio** (huecos, fosos, vacío y, con Maestría, enemigos) y subiendo hasta `maxUp` niveles, por encima del `maxStep` normal. La casilla de llegada debe ser transitable y libre.
- **Bajar saltando** no hace daño hasta `safeDown` niveles (3 con Gran salto); más allá, daño de caída normal por los niveles que sobren.
- **Mate:** solo tras saltar este turno o desde más alto que el objetivo. +3 a acertar además del bono de altura (+2 por nivel, máx. +4); deja Tumbado y, desde arriba, empuja 1 hacia abajo (puede provocar caída).
- **Pase picado:** el balón viaja en línea y puede **rebotar** en muros (1 rebote, 2 a nivel 3). Tras rebotar ignora la cobertura y empuja desde el punto del rebote. Si hay línea de visión va directo; si no, prueba las 8 direcciones con `traceProjectile` (R15) y elige el rebote más corto que llegue.
- **Alley-oop:** necesita un aliado que asista (Chencho, el base, invocado con Tiempo muerto; o cualquier invocación aliada). Sin aliado, contra un muro a mitad de daño.
- **Techo bajo:** propiedad de sala o casilla en Tiled (`ceiling: low`). Ahí no se puede saltar ni hacer Mate; intentarlo dispara el rasgo `techo-bajo`.
- **Cosas redondas:** las entidades y objetos con la etiqueta `redondo` (bombonas, barriles, balones, cabezudos, patitos, el Centollo…).

## Compañeros

Willy no baja solo: tras el cásting, en el Camerino, se le une el compañero de su clase (`rulesets/willy/data/companions.json`). Lo controla el jugador, como a Willy (dos fichas por turno; en el móvil se manda igual que a Willy: tocar al compañero y elegir). Es del mismo bando (`concursantes`).

| Clase | Compañero | Ataque | Apoyo o área |
|---|---|---|---|
| Butanero | **Jonatan, el aprendiz** (carretilla) | Carretillazo: 1d8 a 4 casillas, empuja 2 | Bombona de camping: 1d6 de fuego en área y fuego en el suelo |
| Influencer | **Kevin, el cámara** | Foco en la cara: 1d4 a 4 casillas y Cegado | Primer plano: un aliado queda Afortunado |
| Bardo de verbena | **Loli, la vocalista de la orquesta** | Do de pecho: Aturdidos los enemigos a 2 (salvación de AGU) | Estribillo: 1d6 de vida a ella y los aliados a 2 |
| Socorrista | **Neptuno, el perro de rescate** | Mordisco y arrastre: 1d6 y lo arrastra 1 hacia él | Rescate canino: 1d8 de vida y quita Tumbado y Enredado |
| Tasador | **Doña Rosario, la clienta** | Bolsazo: 1d8 y Tumbado | Esto es de imitación: el enemigo queda Estudiado para Willy |
| Mimo | **Plata, la estatua humana** | Susto de estatua: 1d6 y Asustado | Moneda en la gorra: Afortunado y 1d4 de vida |
| Ingeniero | **Tornillo, el autómata de serie** | Descarga: 1d6 de rayo a 4 | Soldadura: 1d6 de vida (doble a los autómatas) |
| Funcionario | **Iker, el becario** | Grapadora industrial: 1d4 a 4 y Enredado | Café para el jefe: 1d4 de vida y Animado |
| Jugador de basket | **Chencho, el base** | Robo de balón: 1d4 y pierde 1 acción | ¡Contraataque!: un aliado queda Corriendo |

- **Números:** vida, DEF, ataque y dado propios; **suben con el nivel de Willy** (vida por nivel, +1 al ataque cada 2 niveles, +1 a DEF cada 3, el dado sube un escalón en los niveles 5 y 9, las curas suman la mitad del nivel). Se ajustan al empezar cada combate.
- **Energía:** 4-5, se recupera al acabar cada combate como la de Willy. Cada habilidad cuesta 1-3.
- **Si cae:** se queda fuera el resto de esa planta y **vuelve en el mapa siguiente** con media vida (el ruleset lo levanta al empezar el primer combate allí: R23 pedirá un gancho de cambio de mapa para hacerlo al llegar).
- **Chencho y Tiempo muerto:** con Chencho como compañero, Tiempo muerto ya no saca un segundo Chencho: le da la charla (vida, toda la energía y Animado). Si Chencho ha caído, sale el suplente de siempre.
- **Pausa publicitaria:** al acabar cada combate, Willy y su compañero recuperan el 25 % de su vida máxima (`data/willy.json → pausaPublicitaria`). Es una palanca de equilibrio (`BALANCE.md`).

## Modos de eliminación

Elegidos al empezar (`settings.eliminationMode`). No son del ruleset sino de la partida, pero el ruleset los lee:
- **Con repetición:** al caer a 0 de vida, la partida vuelve al último guardado.
- **Sin repetición:** al caer a 0, la temporada termina. Requiere dificultad Concursante o Prime time. La audiencia vale ×1,25.

Detalle de guardado y reacciones en `DESIGN.md` §12.

## Dificultad

`GameState.settings.difficulty` (propuesta del `DESIGN.md` general):

| Modo | Para quién | Qué cambia |
|---|---|---|
| **Turista** | Quien no ha jugado nunca o quiere la historia | Reloj ×1,5; vida ×1,5; los enemigos hacen −25 % de daño; si caes, vuelves al inicio de la planta con el botín que llevabas |
| **Concursante** (normal) | Por defecto | Números de este documento |
| **Prime time** | Quien quiere sufrir | Reloj ×0,8; enemigos +25 % de vida; patrocinadores más exigentes; audiencia ×1,25 |

## Implementación (`rulesets/willy/`)

Código en TypeScript puro que implementa la interfaz `Ruleset` del motor. Los datos de reglas viven junto al código, como en `dnd5e`: `rulesets/willy/data/classes.json` (clases y habilidades) y `rulesets/willy/data/willy.json` (rasgos fijos de Willy). El contenido del juego puede importarlos; el ruleset nunca importa de `content/`.

| Fichero | Qué hace |
|---|---|
| `index.ts` | El ruleset `willy`: atributos, recursos (vida, energía, acciones, fichas, xp y un contador `uso:<habilidad>` por habilidad), estados, glosario, pruebas (`resolveCheck`, `describeCheck`), DIF, movimiento, iniciativa, inicio de turno (ardiendo, envenenado, bailando, electrocutado, «Hablar del tiempo», «Cosas redondas») y fin de combate (vuelve la energía) |
| `character.ts` | Fórmulas (vida, energía, DEF, movimiento, bono de daño), niveles de habilidad por uso y los constructores `createWilly` y `createCreature` |
| `resolve.ts` | Tiradas de ataque (con desglose visible: altura, flanqueo, tumbado, oscuridad, cegado, mareado, compulsado), daño y eliminación, salvaciones, empujones con choque y «fuera de plano», caídas |
| `environment.ts` | Superficies (agua, aceite, fuego, hielo, vapor, tóxico, electrificada, canicas, red, expedientes, gas) y sus reacciones |
| `actions.ts` | Acciones básicas (golpe, empujar, correr, hacer el ganso) y las habilidades de clase, una función por habilidad |
| `creation.ts` | Cásting: solo clase y 3 puntos libres; `buildWilly` |
| `progression.ts` | Experiencia, niveles y efectos de subida de nivel |
| `more-classes.ts` | Influencer, Bardo, Socorrista, Tasador, Mimo e Ingeniero |
| `summons.ts` | Invocaciones y barreras |
| `sheet.ts` | Ficha del personaje para la interfaz |

### Estado por clase

Las 9 clases están completas, con invocaciones y barreras (`summons.ts`, sobre `spawnEntity`/`despawnEntity` del motor). Lo único que no está en el ruleset:

| Qué | Por qué |
|---|---|
| Golpe de valor (Tasador) | Necesita el valor de los objetos de `content/willy/data/items.json`; lo conectará el juego |
| Directo, Unboxing, Viral, Charanga, Necesita likes, Regateo, Peritaje, Subasta | Son de la audiencia, las cajas y el mercado (sistemas del juego); el ruleset emite los estados y eventos que necesitan |
| Maestrías muy vistosas (el fan que explota en confeti, la Torre de telefonía, la Versión beta) | Pendientes de una pasada de pulido |

### Invocaciones y barreras

- Fan entusiasta (`fan-entusiasta`, IA aliada), autómatas (los controla el jugador), antena (torreta: dispara al empezar el turno del Ingeniero) y Chencho (lo controla el jugador). Entran en el orden de turno justo detrás de su dueño; las que duran «hasta el final del combate» se van en `onCombatEnd`, las demás al acabar sus rondas, y todas si su dueño cae.
- Pared invisible y Ventanilla cerrada: objetos que bloquean el paso y la vista, cuentan como muro en los choques y no cuentan para acabar un combate. Chocar con la ventanilla quita 1 acción.
- Con un aliado cerca (Chencho, un fan, un autómata…), el Alley-oop es el de verdad (2d8); solo, «contra la pared» (1d8).

### Decisiones de la revisión 4

- **Flanqueo:** +2 cuerpo a cuerpo si **cualquier** aliado tuyo está pegado al objetivo (no hace falta que esté al otro lado). Más fácil de leer; el glosario ya lo explica así.
- **Cobertura:** −2 con un obstáculo entre medias, −5 con dos o más; los ataques cuerpo a cuerpo la ignoran. El vapor tapa la vista.
- **Afortunado** se gasta en el siguiente ataque; en pruebas fuera de combate dura hasta que caduca (el motor no deja que una prueba aplique efectos).
- **Empujar** usa su propia tirada (`shoveRolled`) con los mismos números que la vista previa, también para criaturas (que ahora pueden tener su propia Fuerza). La vista previa avisa de la consecuencia («¡fuera de plano!», «~5 de daño») y la IA la tiene en cuenta: los enemigos ya empujan a Willy al vacío.
- **Enredado** dura 2 turnos (se renueva mientras sigas en la red o en el papeleo) y «Liberarse» (FUE DIF 13) te saca antes.
- **La experiencia** se guarda como recurso (`xp`, nunca se recarga) y el nivel como atributo (`nivel`).
- **Terco como una mula** da inmunidad a Asustado; **Petrificado** no recibe daño.

### Ganchos del motor que ya usa

- **Choques (R17):** `onCollision` aplica 1d6 contra un muro, 1d4 a los dos contra una criatura y, si al empujón le quedaba recorrido, lanza a la segunda («¡Strike!»).
- **Vacío (R18):** `onVoid` elimina a los enemigos normales («fuera de plano») y a los jefes les quita el 20 % y los devuelve a la casilla libre más cercana. Los fosos se marcan con `terrain: 'void'` en Tiled.
- **Subir de nivel (R19):** `progression.ts` → `levelUpEffects` (nivel +1, 2 puntos de atributo, +3 de vida máxima, 25 % de vida y toda la energía) con `modifyStat`; `levelForXp` con la tabla de experiencia.

- **Invocaciones y barreras (R13):** `spawnEntity`/`despawnEntity`.
- **Fin de turno e inicio de combate (R20):** «Siesta en la silla» (Socorrista) y «Silencio absoluto» (Mimo).
- **Saltos y rebotes (R15):** Gran salto, Alley-oop, Mate del concurso y Escalera imaginaria usan `jumpTargets` y el efecto `jump` (la caída de más pasa por `onFall`); el ruleset añade el techo bajo, el estado «salto» y el evento `saltoCompleto` (con `cruzaVacio`, para logros y Narrador). Pase picado rebota con `traceProjectile`.
- **Mecánicas de planta (R20, `onRoundEnd`):** las cintas (zonas `cintas` con `dx`/`dy`) llevan 1 casilla a quien esté encima al acabar la ronda, como un empujón (también a fosos y fuego); la marea (zonas `marea` con `ciclo`, `altura` y `arrastre`) avisa una ronda antes, inunda las casillas bajas, empapa y arrastra 1 casilla hacia el sur. Los jefes no se mueven por ellas.
- **Trampas:** `noticeTrap` (8 + SUE contra la detección de la trampa, sin dado) y `triggerTrap` (salvación de AGI contra su DIF: si la pasas, mitad de daño y sin efecto; si no, daño entero y enredado 2 turnos o tumbado).

### Lo que sigue esperando al motor


Tests: `tests/rulesets/willy-core.test.ts`, `willy-classes.test.ts`, `willy-classes2.test.ts`, `willy-summons.test.ts` y `willy-review.test.ts` (este recorre todas las habilidades de todas las clases en los niveles 1, 3, 6 y 9) (números de nivel 1, tabla de %, críticos y pifias con RNG forzado, determinismo, subidas de habilidad en 8/24/48/80 usos, empujones, vacío, caídas, superficies y cada habilidad implementada).
