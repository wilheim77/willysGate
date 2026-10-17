# Willy el mazmorrero

*Temporada 1: La Tierra*

> Estado: **aprobada por el usuario con cambios (2026-10-17)**: los tres finales, el modo Sin repetición y las clases Ingeniero, Funcionario y Jugador de basket. Ver [`PROGRESS.md`](PROGRESS.md) → «Decisiones del usuario».
> Sistemas y números en [`DESIGN.md`](DESIGN.md); reglas en [`RULESET.md`](RULESET.md); prólogo en [`INTRO.md`](INTRO.md).

**Tema:** el fin del mundo como entretenimiento. Sobrevivir no basta: hay que hacerlo con gracia.

**Tono:** comedia LitRPG con mala uva, pero amable. El Narrador es sarcástico; el juego, no es cruel con el jugador. Humor costumbrista cántabro contra un espectáculo galáctico hortera. Nadie es malvado del todo: el público solo quiere pasarlo bien, igual que nosotros con los realities.

---

## 1. Premisa

**Willy** (Guillermo Saiz, 36 años) reparte butano en **Castro Urdiales**. Sube bombonas a quintos sin ascensor, desayuna bocartes en el Bar Paco y no aspira a nada más. Es feliz así.

Un martes a las 10:14, todas las pantallas del mundo anuncian que **Canal Abismo**, la mayor cadena de las catorce galaxias, ha comprado la Tierra. El planeta es el escenario de la primera temporada de **¡Mazmorreros!**, un concurso en directo. El suelo se cuadricula, la humanidad cae, y Willy aterriza en la **Planta 1** de una mazmorra de cinco plantas, abrazado a su bombona.

Las reglas son tres:

1. **Baja.** Cada planta tiene un reloj. Cuando llega a cero, la planta se derrumba.
2. **Da espectáculo.** El público premia lo creativo y lo arriesgado; los patrocinadores mandan regalos a quien les gusta.
3. **Sobrevive.**

Al fondo de la Planta 5 espera el presentador, **Jordi Hurtado, el Inmortal**. Quien llega hasta él gana la temporada. Lo que eso significa exactamente no lo sabe nadie, y Canal Abismo no tiene prisa por aclararlo.

## 2. Personajes

### Willy
- Fuerte por oficio, paciente por carácter y testarudo por ser de Castro.
- Habla poco. Cuando habla, suele tener razón o hambre.
- Su único lujo es la **bombona**: no la suelta en todo el juego. Es su arma de partida si elige la clase Butanero, y un objeto de broma recurrente si no.
- **Siempre humano.** Willy es humano, de Castro y con bigote: no se elige raza. Sus rasgos de castreño (terco como una mula, hijo del Cantábrico, hablar del tiempo) son fijos (`content/willy/data/willy.json`).
- **Clase:** al empezar la Planta 1, el Sistema del concurso le obliga a elegir un oficio entre opciones absurdas (ver `RULESET.md`): 9 clases.
- **Ingeniero** (clase especial, dedicada a un amigo del usuario): Willy aparece como el técnico que estaba montando una antena en el tejado de la lonja cuando se acabó el mundo, y al que media comarca culpa del apocalipsis «por lo de las ondas». Construye autómatas de chapa y suelda con arcos voltaicos. Tiene una habilidad que se llama **5G**, a la vista desde el principio para tentar al jugador… y que no hace nada. La primera vez que la usa, el Narrador se ríe («¡Ya sabíamos que el 5G no servía para nada! A lo mejor si lo subes a 6G…»), pero la habilidad sube con el uso a 6G, 7G… hasta **10G**, donde es absurdamente poderosa. Es el chiste recurrente de la clase. El humor es siempre cariñoso: el chiste son los conspiranoicos, nunca el ingeniero, que es el más competente de la mazmorra y el más cansado de dar explicaciones.
- **Funcionario:** veinte años en la ventanilla 4 del registro de Castro. Lanza impresos que aturden, llena el suelo de expedientes, se toma su pausa del café y no hay quien lo mueva de su sitio. La sátira es sobre la burocracia (los formularios imposibles, el «vuelva usted mañana», el silencio administrativo), no sobre quienes trabajan en ella: el Funcionario es eficaz, puntual y el único que se sabe todos los trámites.
- **Jugador de basket:** pívot de dos metros cuatro del Club Baloncesto Brazomar, de Regional. Salta fosos, sube cornisas de un salto, machaca desde arriba y rebota el balón en las paredes. Su perdición: los techos bajos y cualquier cosa redonda, a la que no puede evitar tirarle a canasta.

### El Narrador
La voz del concurso. Un locutor contratado por Canal Abismo que ha narrado ya cuarenta y tantas temporadas en otros tantos planetas, y se le nota.
- **Personalidad:** sarcástico, cansado y nostálgico de temporadas mejores («los krell, por lo menos, se morían con estilo»). Se burla de Willy, pero poco a poco le coge cariño, aunque no lo admita.
- **Función:** comenta todo lo que pasa, explica las mecánicas en el tutorial, anuncia logros y abre las cajas. Es el hilo conductor y la principal fuente de humor.
- **Regla de escritura:** nunca insulta al jugador por jugar mal de verdad; se ríe de las situaciones, de Willy, del público y de sí mismo.

### Personajes recurrentes de la zona segura
Entre planta y planta, Willy pasa por **El Camerino**, la zona segura (ver `DESIGN.md`). Allí están siempre:

| Personaje | Quién es | Para qué sirve |
|---|---|---|
| **Maripuri** | La vecina del cuarto de Willy. Cayó con su carro de la compra y en dos horas ya tenía licencia de comercio del concurso. Nadie sabe cómo. | Lleva **Ultramarinos Maripuri**: compra y venta. Cotilla; sabe cosas de cada planta. |
| **Paco** | El dueño del Bar Paco. Cayó con la cafetera y la cafetera sigue funcionando. | **Descansar** en su barra (recupera vida y energía) y comentar la jugada. |
| **Koldo, el de Bilbao** | Turista de fin de semana que estaba en Castro «porque en Bilbao llovía». Otro concursante. Todo es más grande en Bilbao, incluidas sus desgracias. | Rival amistoso. Llega a cada camerino peor que el anterior, con una historia más absurda. Da misiones opcionales y alguna pista. |
| **Xelda, de Producción** | Ayudante de producción alienígena, con cuatro brazos y un pinganillo en cada uno. Profesional, agotada y la única que trata a Willy como a una persona. | **Guardar la partida** («firmar el parte de planta») y explicar el reglamento. Deja caer que el concurso esconde algo. |

### Los patrocinadores
Seis marcas o personajes galácticos que siguen el programa y premian a quien les gusta. Cada uno tiene gustos, manías y mensajes propios. Detalle y números en `DESIGN.md` → «Patrocinadores».

| Patrocinador | En una línea | Le gusta | No soporta |
|---|---|---|---|
| **Butanos Hermanos Pérez** | Empresa familiar galáctica de gas, sospechosamente parecida a la de Willy. | Fuego, explosiones, bombonas | Que apagues incendios |
| **Seguros La Prudente** | Aseguradora intergaláctica. Te quiere vivo para no tener que pagar. | Curarse, no recibir daño, acabar con vida de sobra | El riesgo, ir con poca vida |
| **Lord Vórtax** | Emperador del Sector 7, aristócrata aburrido y algo sádico. | Muertes creativas, empujones al vacío, crueldad elegante | La piedad, huir |
| **Mamá Clementina** | Influencer de cocina con cinco mil millones de seguidores. | Comer en combate, ayudar a otros, ser majo | La violencia vulgar, la palabrota |
| **La Colmena** | Club de fans con mente colmena. Adora las caídas. | Caer, empujar desde lo alto, la altura | Quedarse a ras de suelo |
| **Glorp Ecosoluciones** | Startup ecologista de un planeta pantano. | Usar el entorno: agua, hielo, superficies | Gastar consumibles, el fuego a lo loco |

Los gustos chocan entre sí a propósito: Butanos Pérez y Glorp no pueden estar contentos a la vez, y La Prudente odia lo que adora la Colmena.

### El antagonista: el Presentador

**Jordi Hurtado, el Inmortal**, presentador de *¡Mazmorreros!* desde la Temporada 1, hace once mil años. Homenaje cariñoso y absurdo al meme de que nunca envejece: aquí la explicación es de ciencia ficción.

> **Nombre en un solo sitio.** El nombre visible del presentador vive únicamente en `content/willy/data/cast.json` (`presentador.nombre`, `corto`, `apodo`). Todos los textos del juego usan las variables `{presentador}`, `{presentadorCorto}` y `{presentadorApodo}`. Si algún día hay que cambiarlo, se edita ese fichero y nada más. En estos documentos se le llama «el Presentador».
>
> **Límites del homenaje:** la broma es la premisa absurda (un vampiro alienígena que se alimenta de audiencia). Nada sobre la persona real, su vida privada ni acusaciones de ningún tipo. Es un personaje de ficción que se ríe del meme, con cariño.

- **Qué es:** un vampiro alienígena. No bebe sangre: **bebe audiencia**. Cada punto de share le quita un día de encima, y lleva once mil años en máximos de audiencia. Por eso tiene la misma cara en la primera emisión que en la última.
- **Cómo es:** traje impecable, voz serena, educadísimo, con una paciencia infinita (literalmente). Presenta con oficio y cariño por el formato. No odia a los concursantes: los necesita, porque son lo que mira el público.
- **Su debilidad:** como buen vampiro, los **focos** directos le sientan fatal. Y, sobre todo, **perder audiencia**: si nadie le mira, envejece.
- **El Narrador y él:** llevan juntos desde siempre. El Narrador se queja de él, pero en el fondo es su único amigo en cuarenta temporadas.
- Es el jefe de la Planta 5 y el último combate, en directo y con público. Fases, arena y frases en `floors.json` → planta 5 → `jefe`.

### Mazmorreros rivales

Otros concursantes de *¡Mazmorreros!* que **no son humanos**: semigaviotas, gnomos de jardín, orcos de oficina, fantasmas en prácticas y minotauros veganos. Willy siempre es humano; ellos son la competencia.

- **Cada partida trae rivales nuevos.** Se generan a partir de la semilla de la partida combinando raza, nombre y apellido, apodo, pueblo de origen, oficio de antes del apocalipsis, personalidad, una manía, un aspecto, un estilo de combate, un comportamiento y un gancho de historia. Hablan con frases montadas a partir de plantillas y coletillas de su personalidad. Nunca se repiten en una misma partida, ni con los últimos 40 vistos en el navegador.
- **Cada raza conserva sus rasgos:** Planeo y Pico largo (semigaviota), Cerámica esmaltada y Pose de estatua (gnomo), Corpulento y Burocracia (orco), Incorpóreo y ¡Bu! (fantasma), Embestida y Principios (minotauro).
- **Legendarios:** muy de vez en cuando (6 % de las salas de rival) aparece uno de los cinco escritos a mano: **Vanesa la Gaviota** (de Laredo, cleptómana encantadora), **Don Ceferino** (gnomo jubilado de Santoña que cree que la mazmorra es su jardín), **Gorka, de Compras** (orco de oficina de Bilbao, de las sinergias), **Mari Luz** (fantasma en prácticas que pide perdón al asustar) y **Asterio** (minotauro vegano que sabe dónde está la salida). Cada uno sale como mucho una vez por partida y nunca en dos partidas seguidas.
- **Encuentros:** como mucho una sala de rival por planta. Tres desenlaces: **derrotarlo** (caja de plata; queda eliminado del concurso), **pactar** (no ataca y puede volver como aliado) o **dejarle ir** (se lleva el botín y puede volver más fuerte). Los rivales que vuelven **recuerdan** lo que pasó; los tramposos pueden traicionar el pacto.
- Koldo, el de Bilbao, es el rival **humano** y amistoso del Camerino; no combate.

Ejemplos generados con la semilla «CASTRO»:

| Rival | Quién es | Estilo |
|---|---|---|
| **Loli Díez, «la que pide hoja de reclamaciones»** | Fantasma en prácticas de Mioño, pintora de brocha gorda, dramática. Tararea el anuncio de los Hermanos Pérez. Ha leído el reglamento entero y dice que hay una errata en la página 4.000. | Ladrona, cobarde. «Soy Loli, la que pide hoja de reclamaciones. ¡Nadie me comprende! ¡Nadie!» |
| **Higinio Zubieta, «el que no se cansa»** | Gnomo de jardín de Liendo, jardinero municipal, empresarial. Lleva la cuenta de sus derrotas en una libreta. Ha venido a buscar a su suegra, que cayó en la Planta 3. | Tanque, propenso a aliarse. «¿Tú eres el butanero? Yo soy Higinio. Te paso mi tarjeta.» |
| **Tere Cobo, «la Pescadera»** | Gnomo de jardín de Barakaldo, pescadera, rencorosa. Silba cuando miente. Le han prometido un patrocinio de Glorp si gana; Glorp no lo sabe. | Pegona, tramposa. «¿Tú eres el butanero? Yo soy Tere. Me acuerdo de todo.» |

## 3. Las cinco plantas

Cada planta tiene un bioma, enemigos propios, una **mecánica característica** y un **jefe**. Los números están en `content/willy/data/floors.json`.

| Planta | Bioma | Mecánica característica | Jefe |
|---|---|---|---|
| 1 | **Castro Sumergido**: una copia del pueblo bajo tierra, medio inundada. Calles, lonja, bodegas. | **Charcos y redes**; en la sala del jefe, la **marea** sube y baja | **Su Majestad el Centollo** |
| 2 | **Hipermercado Eterno**: pasillos sin fin, escaleras mecánicas, rebajas permanentes. | **Cintas y carritos**: las cintas mueven a quien las pisa; los carritos se empujan y atropellan | **Doña Rebeca, Encargada de Rebajas** |
| 3 | **La Verbena Sin Fin**: fiestas de pueblo eternas, de noche, con farolillos. | **Fuego y pólvora**: hogueras, petardos y fuegos artificiales que caen del cielo | **El Gigantón y sus Cabezudos** |
| 4 | **Balneario Glaciar**: termas, saunas y piscinas heladas. | **Frío y vapor**: el agua se congela o se evapora; el vapor tapa la vista | **La Socorrista Abisal** |
| 5 | **El Plató**: los bastidores del propio concurso. | **Focos y cámaras**: bajo un foco el público se vuelve loco, pero todos te ven | **El Presentador** (`cast.json`) |

### Planta 1: Castro Sumergido (tutorial disfrazado)
Willy despierta en una copia exacta de su calle, pero bajo tierra y con agua por los tobillos. Es el sitio que mejor conoce y el más seguro para aprender. Enemigos: **gaviotas de lonja**, **ratas portuarias**, **cangrejos con casco** y **bocartes andantes**. El jefe, el Centollo, vive en la lonja y solo se le puede dañar cuando la marea baja y queda varado.

**Escena fija:** la plaza de Willy, donde el Sistema le obliga a elegir clase («el cásting»). Al salir de la zona de tutorial puede aparecer Vanesa la Gaviota, la primera rival.

### Planta 2: Hipermercado Eterno
Un hipermercado infinito, con hilo musical y megafonía que anuncia ofertas imposibles. Enemigos: **maniquíes**, **carritos poseídos**, **reponedores zombis** y **etiquetas de oferta** voladoras. Doña Rebeca dirige su ejército de carritos desde lo alto de las cajas registradoras.

**Escena fija:** Koldo atrapado en la sección de congelados, que dice que en Bilbao los congelados son más grandes.

### Planta 3: La Verbena Sin Fin
Unas fiestas patronales que nunca terminan, de noche, con orquesta, tómbola y toro de fuego. Enemigos: **cabezudos**, **músicos de charanga**, **vaquillas** y **feriantes**. El Gigantón es un gigante de fiestas de cuatro metros que gira y aplasta; sus Cabezudos lo protegen. Hay que tumbarlo empujándolo o quemando su armazón.

**Escena fija:** la tómbola, donde se puede ganar (o perder) un objeto con una prueba de Suerte.

### Planta 4: Balneario Glaciar
Un balneario de lujo que se ha congelado a medias. Enemigos: **patitos de goma gigantes**, **yetis de sauna**, **medusas de piscina** y **monitores de aquagym**. La Socorrista Abisal es una criatura enorme sentada en una silla de socorrista que «rescata» a los concursantes arrastrándolos al fondo de la piscina.

**Escena fija:** la sauna, donde Paco ha abierto una sucursal del bar «por si acaso».

### Planta 5: El Plató
Los bastidores del concurso: cables, focos, decorados de cartón piedra y regidores con auriculares. Enemigos: **regidores**, **cámaras-dron**, **técnicos de sonido** y **figurantes**. El Presentador pelea en el plató principal, con el público en directo, en tres fases:
1. **Ronda de preguntas:** desde su atril lanza tarjetas afiladas y hace preguntas en un panel gigante; las baldosas de las respuestas falsas se abren como trampillas.
2. **Pausa publicitaria:** se apagan las luces y se convierte en una nube de murciélagos con micrófono que solo es vulnerable bajo los focos; su «mordisco de share» le roba audiencia a Willy.
3. **Gran final:** el público vota cada ronda según la audiencia de Willy. Mientras le quede **Share**, es inmortal: no baja de 1 de vida. Para vencerle hay que dejarle sin vida **y** sin audiencia, a base de espectáculo.

**Escena fija:** el despacho de Xelda, donde se descubre qué pasa con los ganadores de las temporadas anteriores.

## 4. Desenlace (aprobado: los tres finales)

Al derrotar al Presentador, el público vota. Xelda revela lo que vio en su despacho: los ganadores de las temporadas anteriores se convirtieron en **copresentadores** del Presentador, en otros planetas… y él les ha sobrevivido a todos, porque la audiencia siempre acaba volviendo a él. Ahora le ofrece el puesto a Willy. Después, el jugador **elige**:

- **Final A, «Nuevo presentador»:** Willy acepta. El Presentador le ofrece «un traguito de share para que no se te arrugue la cara». Final cínico, con el Narrador encantado de tener por fin un compañero de cabina y Willy con bigote eterno.
- **Final B, «Vuelta a casa»:** Willy se niega y vuelve con los suyos al Camerino. El Presentador lo acepta con elegancia: «Ya volverás. Todos vuelven». Final amable, con el Narrador fingiendo que no se emociona.
- **Final C, secreto, «Letra pequeña»:** aparece como tercera opción solo si se cumplen **las tres** condiciones al derrotar al Presentador:
  1. audiencia de **50 millones** o más;
  2. **3 patrocinadores o más «a favor»** (o «fan») a la vez;
  3. haber hablado con Xelda en su despacho de la Planta 5 (escena fija) y haber leído el contrato del concurso.
  Willy compra la cadena con lo ganado y cancela el programa. Sin audiencia, el Presentador, por primera vez en once mil años, envejece un día; le sale una cana, la mira con curiosidad y se va, muy digno, a jubilarse a un planeta playa. «En catorce galaxias nadie había leído la letra pequeña. Un butanero de Castro, sí.»

Si no se cumplen, la opción C no se muestra (tampoco tachada: es secreta). Hay un logro oculto por cada final, con pista. Los tres terminan con un gancho a la **Temporada 2**: tras los créditos, en un planeta lejano se enciende una tele y ahí está el Presentador, con la misma cara, diciendo «Buenas tardes». Es inmortal: siempre vuelve.

En modo **Sin repetición**, el final elegido se registra en el perfil con una marca especial («en directo»).

## 5. Muestra de tono

> **Narrador** (al entrar en la Planta 2): «El Hipermercado Eterno. Abierto veinticuatro horas, trescientos sesenta y cinco días, desde hace once mil años. Las colas de la caja también.»
>
> **Maripuri** (en el Camerino): «Hijo, que he oído que en la planta de abajo hay fiestas. Llévate una chaqueta, que refresca.»
>
> **Koldo**: «¿Un centollo gigante? Eso en Bilbao lo tenemos de aperitivo.»
>
> **Narrador** (Willy empuja a un maniquí escaleras mecánicas abajo): «Treinta mil espectadores nuevos. Por un maniquí. Esta civilización merecía desaparecer.»
