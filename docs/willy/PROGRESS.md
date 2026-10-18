# Willy el mazmorrero: progreso

> Rama: `willy`. Se trabaja en paralelo con la sesión principal (motor e *Intereses*), sin tocar código compartido.

## Estado actual

- **Fase W0, Diseño:** **completada y aprobada con cambios** (2026-10-17). Ver «Decisiones del usuario».
- La premisa la definió el usuario: concurso galáctico retransmitido, 5 plantas con reloj, cásting LitRPG, audiencia, patrocinadores, cajas de botín, logros y Narrador.
- **Ruleset `rulesets/willy/`:** completo para las 9 clases, con invocaciones y barreras, ganchos de fin de turno e inicio de combate, subida de nivel, y los arreglos de la revisión 4. Falta lo que es del juego (audiencia, valor de objetos) y el salto real del motor (R15). Explota también los barriles `explosivo` al romperse.
- **Primera versión jugable (`content/willy/game.ts`):** cásting (clase y puntos) → Camerino (Maripuri, Paco, Xelda y Koldo; ascensor de servicio) → prueba hecha a mano de la Planta 1, «Castro Sumergido» (muelle con altura, canal al vacío, charcos de agua, barril de gas; dos ratas, una gaviota y un cangrejo). Mapas construidos en código con los ids de terreno de `ninja.json` (`content/willy/maps.ts`); arranque y cásting en `content/willy/setup.ts`, sin imports del cliente, para que los tests no toquen `src/`. Textos de interfaz en `texts/ui.json`. `GAME=willy npx vite build` compila. **Falta en el cliente:** que `GameDefinition` lleve `maps` y que `src/main.ts` los pase a `createEngine` (sin eso el ascensor no viaja); pedido a la sesión principal.
- **Plantas procedurales (`content/willy/gen/floor.ts`):** las 5 plantas se montan con piezas de sala de 12 por bioma (`data/rooms/<bioma>.json`; Castro mías, Plantas 2-5 de la sesión de mapas) y `deriveSeed`: camino crítico, ramas y bucles, roles, alturas de sala de un nivel en un nivel, puertas, enemigos por presupuesto, jefe, cajas, trampas, barriles, luces y como mucho una sala de rival. Se validan (todo alcanzable, nadie a menos de 6 casillas de la llegada, 2 cajas como mínimo) y se reintenta. Cada planta se genera al llegar (R21), con la semilla de la partida y los rivales ya vistos (un rival con pacto o que huyó puede volver, con un 40 %), y queda en el almacén del mundo como cualquier mapa. La escalera de la Planta N lleva al `camerino-N`, cuyo ascensor baja a la N+1; tras la 5 no hay ascensor (el final llega en W5).
- **Rivales procedurales (`content/willy/gen/rivals.ts`):** de `rival-generator.json`, con unicidad en la partida, escalado por planta, cuerpo y paleta del arte modular, frases con variables y un 6 % de legendario. `systems.rivals` guarda de dónde salió cada uno.
- **Encuentro, pacto y huida (2026-10-18, rama `willy-rivales`):** `content/willy/dialogues/rival-encuentro.json` es un único árbol de diálogo, reutilizado por cualquier rival (procedural o legendario): Derrotar (combate), Pactar (tirada de Carisma contra la DIF del comportamiento del rival; éxito da fichas y el rival se va en paz) y Dejar ir. El texto es el del propio rival (`rivalLine`/`legendaryLine`), ya resuelto y guardado en etiquetas de la entidad (`dlg-inicio/amenaza/pacto/huida/derrota`) al generarla; el cliente las lee con la convención genérica `$partnerTag:<prefijo>` (nueva, en `src/ui/dialogueBox.ts`), y `$partner` como hablante, así el mismo árbol sirve para cualquier entidad procedural. La DIF de la tirada también es dinámica: `engine/dialogue.ts` añade `dc: { partnerTag }`, que lee la etiqueta `pacto:<n>` de con quién se habla (extensión genérica del motor, no específica de Willy). `content/willy/gen/floor.ts`: los rivales nuevos y los que volvieron tras huir esperan a que se les hable (`dialogue:rivalEncuentro`, sin emboscada automática); los que volvieron tras un pacto entran directos como aliados temporales (facción del jugador) salvo que sean tramposos y traicionen (`traicionChance`, `comportamientos.tramposo.traicion`), en cuyo caso es una emboscada hostil normal. `rulesets/willy/rivals.ts` (`rivalAfterCommand`) registra el desenlace en `systems.rivals` y avisa al Narrador (`rivalEncountered`, banco `rivalAparece` en `narrator/plantas.json`) en la presentación, el pacto, la huida, la derrota (cualquier rival eliminado) y la traición. Tests: `tests/content/willy-rivals-dialogue.test.ts` (etiquetas resueltas sin huecos, DIF de pacto, árbol sin callejones sin salida con las tres salidas alcanzables, Derrotar/Pactar/Dejar ir jugados de principio a fin).
- **Trampas en el ruleset:** `noticeTrap` (8 + SUE contra la detección) y `triggerTrap` (salvación de AGI: condición, superficie, empuje o caída).
- **R15:** saltos con el motor y rebote del Pase picado.
- **Compañeros (2026-10-18):** uno por clase, se une tras el cásting, lo controla el jugador, sube con Willy y vuelve en la planta siguiente si cae (`RULESET.md` → «Compañeros»). Pausa publicitaria: 25 % de vida al acabar cada combate.
- **Equilibrio (2026-10-18, temporada de 10 pisos):** la temporada tiene 10 pisos, dos por planta (guardián y jefe).
  - La experiencia es real: de nivel 1 a 11 (`rulesets/willy/xp.ts`).
  - Habilidades por uso con umbrales 8/24/48/80; la principal llega a la Maestría hacia el piso 8.
  - En pantalla: «Nivel N · usos X/Y» y avisos al subir.
  - El reloj de derrumbe está en `rulesets/willy/clock.ts`.
  - Las derrotas vuelven al último Camerino.
  - Los enemigos son variados: élites, «kite», `estalla` y 22 habilidades de monstruo.
  - `simulateSeason` simula la temporada entera. Con 27 temporadas sale un 74-100 % de pisos sin perder, un 88-100 % de jefes a la primera y 24 de 27 temporadas terminadas. Tabla y palancas en `BALANCE.md`.
  - Falta volver a medir el piso 10 cuando lleguen las fases del Presentador.
- **Golpe de valor (2026-10-18):** el Tasador lanza un objeto de la mochila, que se pierde (el de bronce vuelve con la Maestría). Daño: 1d6 más la mitad de su valor; desde el nivel 4, el valor entero. Elige solo: primero la chatarra, luego lo que no cura y al final lo que cura. El oro y lo legendario, solo si lleva otro igual. La previsualización dice qué se lanza.
- **Fin de la temporada (2026-10-18):** al caer el jefe del piso 10, que lleva la etiqueta `jefe-final` (`rulesets/willy/ending.ts`):
  - El reloj se para, y un disparador del juego abre la conversación `final-temporada` (`content/willy/dialogues/final.ts`).
  - Xelda cuenta lo que vio, el Presentador ofrece el puesto y se elige A o B, o C si se cumplen sus condiciones (50 millones de audiencia, 3 patrocinadores a favor o fans y el contrato leído).
  - Cada final tiene su epílogo y luego el gancho de la Temporada 2.
  - El último nodo fija `willy:final`: sale `runEnded { resultado: 'victoria', final }`, con los logros de final y fin de temporada.
  - Después, el resumen de la temporada (`GameDefinition.ending`, nuevo y genérico en el cliente) con «Créditos» y «Nueva temporada». En Sin repetición se borra la ranura y el título dice «En directo, sin repetición».
  - **Desviación:** el despacho de Xelda (escena fija) no existe todavía. El contrato se lee hablando con Xelda en los Camerinos 8 y 9.
  - Pendiente: la marca «en directo» en el perfil (agente meta).
- **FX:** los `skillUsed` llevan `target` y van antes de las tiradas.
- **Meta (2026-10-18, rama `willy-meta`):**
  - **Logros:** se evalúan en el ruleset tras cada comando (`Ruleset.afterCommand`, `rulesets/willy/achievements.ts`). Traduce los eventos del motor al vocabulario de `achievements.json` (`attackResolved`, `objectDestroyed`, `entityPushed`…) y aplica el lenguaje de condiciones con contadores por partida, planta, combate o turno, disparadores `al` y datos vivos (`dato`).
    - Se guardan en la partida (`systems.willyMeta`): «siempre» cuenta como «partida».
    - Al desbloquearse, aparece un aviso arriba, suena la frase del Narrador (cabecera + frase propia) y llega la caja. Hay una lista 🏆 en la barra superior, por categorías, con los ocultos como «???» y su pista.
    - 158 logros, 23 de ellos nuevos: primera victoria, primer barril, empujón final, intocable, planta limpia, primer jefe, probar todas las habilidades, dos críticos, racha de fallos, remontada, una sola ronda, cinco en un combate, 15 de daño de un golpe…
    - Las muertes del compañero cuentan para el grupo. Las recompensas de XP pasan a ser cajas: la XP es del agente de Willy.
  - **Cajas:** se ganan con logros, jefes (tabla `fuentes.jefes`), élites, rivales y plantas limpias. El botón 🎁 cuenta las pendientes.
    - La apertura sigue DESIGN §8: caída, sacudida según el nivel de la caja, tapa, haz de la mejor rareza y cartas boca abajo, más «Ver probabilidades».
    - Se tira con el RNG de la partida, con garantía, piedad, sin repetir en la caja, únicos y como mucho 2 copias.
  - **Objetos:** son acciones `obj:<id>` dentro y fuera de combate, con los macros de `items.json` interpretados en `rulesets/willy/items.ts`.
    - El equipo cambia atributos mientras se lleva, aplica inmunidades y da luz.
    - La mochila 🎒 (la misma que en *Intereses*) permite beber, comer, usar y equipar.
    - El kit de clase se reparte en el cásting.
    - 12 objetos nuevos: pociones (Gaseosa, Caldo, Agua de la Fuente Santa, Orujo), granadas (Bomba fétida, Bengala), una bebida energética y chatarra de patrocinadores.
    - Los que necesitan sistemas que aún no existen quedan fuera de las cajas (`loot-tables.json → fueraDeCajas`).
  - **Botín de enemigos:** fichas, a veces un consumible y, raramente, un objeto mágico, mejor en élites y jefes (`loot-tables.json → enemigos`). Avisa con un toast y una frase.
  - **Curación fuera de combate:** 5 % de la vida máxima por cada 4 casillas que anda Willy, para él y su compañero, y vida completa al llegar al Camerino (`willy.json → regeneracion`). La Pausa publicitaria (25 %) se queda.
  - **Modo de eliminación:** antes del cásting se elige la dificultad y luego Con o Sin repetición; Sin repetición no está disponible en Turista.
    - Con repetición: se vuelve al último `rested` y las plantas siguientes se recolocan (`willy:intento`).
    - Sin repetición: una ranura propia con autoguardado y contador de escrituras compartido con el perfil, sin guardar, cargar ni exportar a mano. Se borra al caer y sale el resumen de la temporada.
- **El show (2026-10-18, rama `willy-show`):** audiencia, patrocinadores, contratos y el Share del presentador funcionan en partida (`rulesets/willy/show/`, datos en `content/willy/show.ts`). Un gancho `afterCommand` (orden 50, y otro tras los logros, orden 110) traduce los eventos a las «vistas» de los datos (`show/patterns.ts`) y aplica `audience.json`, `sponsors.json` y el `medidorShare`. Las cajas e items van por `loot.grantLootBox` / `loot.grantItem`. **Contratos** (nuevo, no estaba en DESIGN.md): 11 en `sponsors.json → contratos`, se ofrecen en el Camerino o al interesarse un patrocinador, máximo 2 a la vez; premio o multa en fichas. **Cliente:** `GameDefinition.hud` (genérico, `src/ui/showHud.ts`): contador de audiencia arriba a la derecha (tocar abre el panel de patrocinadores con gustos legibles, `gustosTexto`, y los contratos), «+N audiencia» flotando, bocadillos de patrocinador y de hitos. El Narrador ya casa sus bancos con esas vistas y rellena los filtros de concordancia (`{enemigo:el:Mayus}`). Pendiente de diseño: «Necesita likes» del Influencer nunca salta (la audiencia no baja del mínimo); Mamá Clementina depende de eventos de diálogo que aún no existen.

## Hecho (W0)

| Entregable | Dónde |
|---|---|
| Historia, personajes, patrocinadores, plantas y finales | [`STORY.md`](STORY.md) |
| Guion del prólogo (16 viñetas, 1:48), ya ilustrado por la sesión de arte | [`INTRO.md`](INTRO.md) · `content/willy/cinematics/` (rama de arte, ya en `main`) |
| Reglamento d20 propio (atributos visibles, niveles frecuentes, habilidades que suben con el uso) | [`RULESET.md`](RULESET.md) |
| Diseño completo: procedural, reloj, audiencia, patrocinadores, cajas, logros, Narrador, Camerino, onboarding, arte, fases | [`DESIGN.md`](DESIGN.md) |
| Peticiones al motor y al cliente (R1-R15) | [`ENGINE_REQUESTS.md`](ENGINE_REQUESTS.md) |
| Willy siempre humano (rasgos fijos) y 9 clases, incluidas las especiales Ingeniero, Funcionario y Jugador de basket (57 habilidades y mazo de ventajas) | `rulesets/willy/data/willy.json`, `classes.json` |
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

- Después: mecánicas de planta (marea, cintas: R20 `onRoundEnd`), salas fijas de historia, cajas de botín al abrirlas, reloj de planta, audiencia y patrocinadores, Narrador y valor de los objetos (Golpe de valor).
- Pendiente de detalle del encuentro con rivales: línea de «vuelve como aliado»/«traición» en el Narrador se anuncia en `mapChanged`/`combatStarted` (aproximado, no exactamente al entrar en la sala); si se nota raro en el juego real, afinarlo. `entrarPlanta` (banco del Narrador) ya tiene una línea de llegada y una de visita repetida por cada una de las 10 plantas (dos pisos por bioma, variable `{planta}`).
- **Patrocinadores y audiencia enganchados al encuentro con rivales (2026-10-18):** `engine/dialogue.ts` añade `DialogueChoice.tags` (genérico: etiquetas de sabor para que otros sistemas reaccionen a una elección, p. ej. «amable»/«grosero»), llevadas al evento `dialogueChoice`; `rulesets/willy/show/patterns.ts` las traduce a `etiquetas` (como ya hace con `item.etiquetas`). Las elecciones Pactar y Dejar ir del árbol del rival llevan `tags:["amable"]`. `rulesets/willy/rivals.ts` emite además `npcHelped { entityId, metodo }` en un pacto o una huida (perdonar a cualquier NPC, no solo a rivales); como `rivalAfterCommand` corre después del show en la cadena de `afterCommand`, `npcHelped` se añadió a `LATE_EVENTS` de `showLateAfterCommand` (igual que `achievementUnlocked`) para que le llegue a los patrocinadores en el mismo comando. Mamá Clementina ya tenía gustos para `dialogueChoice.etiquetas:amable` y `npcHelped`, pero nunca se disparaban; ahora sí. Se le añadió además un gusto por `safeZoneEntered` (visitar el Camerino).
- **«Necesita likes» del Influencer, arreglado:** estaba escrito contra «la audiencia baja del mínimo de la planta», algo que el diseño hizo imposible (la audiencia nunca baja de ese mínimo). Nuevo disparador real: `rulesets/willy/traits.ts` (`traitsAfterCommand`, hook 56) aplica `mareado` 2 turnos cuando la audiencia pierde por aburrimiento o monotonía (`audienceChanged` con esa `causa`, que sí se dispara). `classes.json` y `RULESET.md` actualizados.
- Tests: `tests/content/willy-rivals-show.test.ts`.

## Notas para retomar

- Los datos JSON se validaron con un script de comprobación cruzada (ids de objetos en tablas, clases, patrocinadores y logros; rarezas; pistas de ocultos; ids de frases únicos). Al crear `rulesets/willy/`, convertirlo en test de contenido (`tests/content/willy-data.test.ts`) junto con el test de variables del Narrador.
- Todo lo de *Willy* respeta las fronteras: solo `docs/willy/` y `content/willy/` (salvo `cinematics/` y `public/assets/cinematics/`, que son de la sesión de arte).

## Rondas de pulido (textos, logros y cajas)

| Ronda | Fecha | Cambios |
|---|---|---|
| 1 | 2026-10-17 | 15 líneas reescritas (menos «catorce galaxias» y «once mil años»: de 19 y 10 apariciones a 8 y 7), 7 líneas nuevas con guiños a rivales, clases y al presentador, 1 línea floja sustituida. **Logros:** «Zapping» era imposible (la audiencia nunca baja del mínimo de la planta) y ahora pide llegar a ese mínimo; aclaradas 4 descripciones (5G y logros que solo puede conseguir una clase). **Cajas:** dos legendarios (Remo de la Castreña y Llavero de Producción) disponibles desde la primera partida, para que una tirada legendaria nunca se quede sin objetos en un perfil nuevo; sus logros dan ahora una caja de plata. |
| 2 | 2026-10-17 | **Rivales:** las razas tienen forma en minúscula y con género para mitad de frase (`enFrase`: «gnoma de jardín», «minotaura vegana»); fuera la plantilla que ponía una coletilla con «¡» en minúscula tras «Y»; «influencer de su pueblo» → «influencer de pueblo» (chocaba en primera persona); 18 plantillas de frases nuevas (las 8 situaciones tienen ahora 5 cada una) y 4 líneas nuevas del Narrador para rivales, con versión masculina y femenina donde hacía falta. Comprobado renderizando las 40 plantillas con 3.000 rivales al azar de ambos géneros: ninguna variable sin resolver. **Logros de rivales:** usan las variables del rival (`{rivalNombre}`, `{rivalApodo}`) en lugar de las de enemigo. |
| 3 | 2026-10-17 | **Botín:** la categoría «herramientas» de bronce solo tenía el paraguas (salía siempre él en las cajas de bronce): añadidas la Caña de pescar del abuelo y el Rodillo de cocina. No había consumibles legendarios: añadido el **Share embotellado** (único; se desbloquea con «Apagón de audiencia»). 4 textos de sabor corregidos o afinados (concordancia «una tuba», extintor). **Apertura de cajas:** 8 líneas nuevas del Narrador (aperturas propias del Tasador, la Influencer y el Funcionario; cajas solo de consumibles; repetidos; Share embotellado). **Logros:** 4 descripciones aclaradas (dónde ocurren: Planta 1 y 2, hielo) y la frase de «Apagón de audiencia» anuncia el desbloqueo. Total: 96 objetos, 417 frases. |
