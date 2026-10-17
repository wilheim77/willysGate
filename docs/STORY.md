# Intereses
*Acto I: Hondonegra*

> Estado: **aprobada** (Fase 0, 2026-10-16). Cambios posteriores a la aprobación se anotan al final, en el registro de cambios.

**Tema:** todo se paga, y casi nunca lo paga quien firmó.

**Tono:** fantasía oscura al estilo Abercrombie. Nadie es elegido, nadie es bueno del todo y la violencia deja marca. El humor es seco y cínico. Ninguna decisión es limpia.

---

## 1. Situación inicial

> **Progresión:** el protagonista y los compañeros empiezan a **nivel 3**: son profesionales con oficio, no aprendices. Suben a 4 tras investigar el pueblo, a 5 tras la noche de las antorchas y a 6 antes del jefe.

Trabajas como cobrador a comisión para la **Casa Valcárcel**, la banca más respetada del Ducado. Es respetada porque nadie que le debiera dinero ha vivido lo suficiente para hablar mal de ella. El encargo es cobrar al barón **Ulric Mazo**, señor de Hondonegra, 4.000 coronas más intereses. Si cobras, te quedas el 10 %. Si no cobras, te quedas el viaje.

Tu pasado depende de la clase que elijas:

| Clase | Por qué trabajas para Valcárcel |
|---|---|
| Guerrero | Mercenario licenciado. Tu última compañía se disolvió cuando el patrón dejó de pagar. Conoces el oficio desde el otro lado. |
| Pícaro | Antes robabas a la banca. Ahora cobras para ella. Te pagan algo mejor y te persiguen menos. |
| Mago | La Academia te expulsó y Valcárcel te financió los estudios. Tu deuda paga intereses en forma de favores como este. |
| Clérigo | Tu orden está en bancarrota y el prior te ha «prestado» al banco como garantía. |

Te acompaña **Dorotea Vane**, la contable que el banco manda para comprobar que la plata llega entera. En el último tramo del camino, una partida de mineros hambrientos os corta el paso. Ese combate sirve de tutorial y también se puede resolver hablando.

---

## 2. Razas

Hay cinco razas jugables: Humano, Elfo, Enano, Mediano y Semiorco. Los rasgos mecánicos se definen en `docs/DESIGN.md`. Aquí solo va su papel en la historia.

- **Humano:** la mayoría. Nadie se fija en ti, y eso tiene sus ventajas.
- **Elfo:** quedan pocos y son muy viejos. En el Ducado suelen ser ricos, y no por sabios: es que llevan siglos ahorrando y el interés compuesto hace el resto. Los enanos los odian.
- **Enano:** mineros de oficio. En Hondonegra se les respeta en la mina y se les mira con recelo fuera de ella. Odian a los elfos.
- **Mediano:** se le subestima siempre, lo que a veces sale caro y a veces barato.
- **Semiorco:** se le mira con recelo en todas partes, y sin respeto que lo compense.

### La enemistad entre elfos y enanos

- **La versión oficial:** el **Pleito de las Raíces**, un juicio de hace tres siglos sobre los bosques que los enanos talaron para apuntalar sus minas. Sigue abierto en los tribunales del Ducado. Las costas ya superan el valor del bosque. Ninguna de las dos partes piensa ceder, porque ceder ahora sería admitir que han pagado todo eso por nada.
- **La versión que nadie recuerda:** los cantares élficos más antiguos hablan de «el metal que canta» y de las bóvedas que los elfos sellaron para guardarlo. Los enanos, en algún otro lugar y hace mucho tiempo, abrieron una. La guerra empezó ahí, no en los bosques. En la Bóveda de Hondonegra, un protagonista elfo o enano puede reconstruir esta historia (ver la escena 6).
- **En Hondonegra:**
  - El **clan Hulla**, una familia de mineros enanos, forma el núcleo duro de la Cuadrilla. Su cabeza, **Odda Hulla**, es la mano derecha de Nella.
  - **Lisandro Fuss**, el prestamista, es elfo. Para los Hulla eso lo confirma todo, y en su caso, por desgracia, tienen razón.
- **Consecuencias en el juego:**
  - **Si eres elfo:**
    - Los PNJ enanos empiezan hostiles: Persuasión con desventaja y precios más altos.
    - Odda Hulla tiene réplicas propias para ti.
    - En D1, si te unes a la Cuadrilla, los Hulla no te siguen salvo que superes una tirada.
    - Lisandro te trata como a un igual: tienes ventaja en Perspicacia con él y diálogos exclusivos.
  - **Si eres enano:** es el caso inverso.
    - Los Hulla te aceptan sin preguntas.
    - Lisandro te sube los intereses de cualquier préstamo y te mira por encima de seis siglos.
    - Tienes opciones exclusivas para apretarle.
  - **Garrán, sobre los dos:** «Os parecéis más de lo que creéis. Los dos me miráis igual.»

---

## 3. Hondonegra

Es un pueblo minero metido en un valle, a la sombra de su propia escombrera. El río, **el Lloro**, baja gris por los residuos de la plata y nadie bebe de él dos veces. Hace ocho meses que la mina está cerrada y el pueblo se está muriendo despacio, de forma ordenada, como se muere todo lo pobre.

### Lugares

- **La plaza y la Torre del Cepo.** Es la antigua torre de justicia, con su horca.
- **La abadía vieja.** La construyeron unos monjes que se marcharon «por motivos». Ahora es la residencia fortificada del barón.
- **El Pico Roto.** La posada: vino agrio, camas con historia y rumores.
- **La capilla de la Santa Pala.** Está excavada en una bocamina abandonada.
- **La casa de empeños de Lisandro Fuss.** Es la única tienda del pueblo que prospera.
- **Alrededores:**
  - **El Escorial:** escombreras y campamento de bandidos.
  - **El Pozo del Ahorcado:** un pozo antiguo que todos dan por cegado.
  - **La entrada principal de la mina.**

### Facciones

| Facción | Líder | Qué quiere |
|---|---|---|
| **La abadía** | El barón **Ulric Mazo**, culto y cobarde, que escribe una poesía espantosa. A su lado, la senescal **Hilda Cardo**, la persona más competente del valle. | El barón quiere que todo esto se le pase solo. Hilda quiere sobrevivir a su señor y está echando cuentas de si vale más vivo o muerto. |
| **La Cuadrilla** | **Nella Yesca**, viuda de uno de los cuarenta. Su mano derecha es **Odda Hulla** (enana). | Ver al barón colgado de la Torre del Cepo y quedarse la mina para el pueblo. Tiene razón en casi todo, y eso la hace peligrosa. |
| **La Santa Pala** | El capellán **Cirilo Hondo**. | Sellar la mina para siempre, porque dice que la plata es la sangre de la tierra. Está medio loco y medio en lo cierto: una vez oyó el canto y sus sermones lo repiten. |
| **Casa Valcárcel** | Dorotea Vane, y en secreto **Lisandro Fuss** (elfo), el prestamista. | En apariencia, cobrar la deuda. En realidad, quedarse con la mina. |
| **Los Callados** (oculta) | Absalón Brea. | Ver la sección 6. |

---

## 4. Lo que pasó de verdad (el secreto del acto)

1. Hace un año, el barón pidió prestado a Valcárcel para abrir una galería nueva, **la Garganta**.
2. El capataz **Absalón Brea** bajó con cuarenta hombres y dieron con una **bóveda** anterior a cualquier reino conocido. Dentro había **plata viva**, un metal que «canta» cuando se trabaja. Los hombres que oyeron el canto se volvieron unos contra otros.
3. Brea ordenó sellar la galería con los hombres dentro. Las cargas las puso un minero joven, **Garrán Tizón**, por treinta coronas, y esa misma noche se fue del pueblo.
4. Brea volvió a bajar solo. Descubrió que quien lleva una **collera** forjada con plata viva puede dar órdenes a quienes han oído el canto. Los supervivientes, una docena, son ahora **los Callados**: obedecen, cavan y no hablan.
5. Brea saca la plata por el Pozo del Ahorcado y se la vende a **Lisandro Fuss**, que es agente de Valcárcel. **El banco sabe que la mina vale cien veces la deuda.** El barón no puede pagar porque Brea le oculta la producción. El cobro es solo la excusa legal para **embargar la mina**, que el banco después le venderá a Brea.

El protagonista es el instrumento de ese embargo, aunque al principio no lo sabe.

---

## 5. Compañeros

En esta fase no hay sistema de aprobación. Los compañeros comentan, discrepan y pueden **abandonar el grupo o volverse contra él** según las decisiones (ver D2, D3 y D4).

### Dorotea Vane, «la Contable». Pícaro, humana

- **Personalidad:** educada, exacta, imperturbable. Lleva un libro donde apunta todas las deudas, también las morales. Su frase recurrente es «Le apunto».
- **Qué quiere de verdad:** es deudora vitalicia de Valcárcel y este encargo cancela lo que debe. Quiere ser libre, y para ella libertad significa saldo cero.
- **Qué oculta:** lleva una orden sellada. Si el barón se niega a firmar el embargo, tiene que encargarse de que muera sin heredero, porque entonces la mina pasa al acreedor. Y si el cobrador se vuelve un estorbo, también tiene que encargarse del cobrador.
- **Su arco:** descubre que el banco la ha usado igual que a todos los demás. Lo que haga con eso depende del jugador.
- **Reclutamiento:** viene en el grupo desde el principio.
- **Voz:** «La compasión es un gasto, no un error. Hay que saber presupuestarlo.»

### Garrán Tizón. Guerrero, semiorco

- **Personalidad:** grande, callado y sin ninguna paciencia para los eufemismos. Era minero, luego fue mercenario y ahora vuelve a casa sin saber por qué. Le preocupa más la verdad que la gente.
- **Qué quiere de verdad:** encontrar a su medio hermano **Ivo**, uno de los cuarenta. Él lo cuenta así: «La mitad buena, decía mi madre».
- **Qué oculta:** las cargas que sellaron la galería las puso él. No sabe que los hombres siguieron vivos un tiempo ahí dentro.
- **Reclutamiento:** te lo encuentras en el camino durante el prólogo, sentado en la cuneta con dos botas que no son suyas.
- **Voz:** «Un hombre que dice "con todos mis respetos" ya ha decidido que no te debe ninguno.»

### Fray Anselmo. Clérigo, mediano

- **Personalidad:** charlatán, glotón y cobarde de manual. Vende indulgencias «pagaderas a plazos». En los momentos pequeños tiene una ternura que él mismo niega.
- **Qué quiere de verdad:** un sitio donde nadie lo conozca y una despensa llena.
- **Qué oculta:** no es fraile. Le quitó el hábito a un fraile que se estaba muriendo en una zanja. No lo mató, y él insiste mucho en esa diferencia. Los poderes curativos le llegaron con el hábito. No sabe qué dios le contesta y le aterra que sea uno de los que cobran.
- **Reclutamiento:** la Santa Pala está a punto de ahorcarlo por hereje en la plaza. Puedes salvarlo hablando, pagando o a golpes.
- **Voz:** «Los dioses perdonan. Lo que no hacen es olvidar, y eso es exactamente lo que yo necesitaría.»

> **Nota de diseño:** los compañeros cubren Guerrero, Pícaro y Clérigo. Si el jugador elige **Mago**, el grupo queda completo. Si elige otra clase, no habrá magia arcana, y los barriles y el aceite del entorno compensan en parte. Queda abierta la posibilidad de un cuarto compañero mago (ver `docs/PROGRESS.md`).

---

## 6. Antagonista: Absalón Brea, «el Capataz»

Es humano y tiene unos cincuenta años. Empezó de niño cargando cestos en esa misma mina. Desprecia por igual las manos blandas del barón y las manos limpias del banco: está convencido de que es el único en el valle que ha trabajado de verdad. No se considera un monstruo. Los cuarenta iban a matarse entre ellos de todas formas, él solo cerró la puerta. La plata viva es el futuro de Hondonegra, y si ese futuro necesita esclavos, el pasado también los necesitó.

**Cómo funciona en combate:** pelea en la Bóveda, protegido por los Callados, Ivo entre ellos.

- Unos **resonadores** de plata viva destructibles obligan cada ronda a una salvación de Sabiduría. Quien falla queda *embelesado* y pierde la reacción.
- Hay barriles de pólvora, poleas y cadenas, y plataformas a varias alturas (ventaja por altura y daño por caída).
- A mitad del combate, Brea vuela un polvorín y hunde parte del suelo.
- Si tienes las pruebas del contrabando, una tirada de **[Engaño] CD 18** («el banco ya te ha vendido») le hace dudar y consigues que los Callados pierdan un turno.

---

## 7. Estructura del acto (unas 2,5–3 h)

| # | Escena | Contenido | Combate |
|---|---|---|---|
| **P** | **El camino** (15') | Creación de personaje, presentación de Dorotea, reclutamiento de Garrán. | Mineros hambrientos (tutorial, se puede evitar hablando) |
| **1** | **Llegada a Hondonegra** (15') | La plaza y la presentación de las facciones. El juicio de Fray Anselmo. Primer roce entre los Hulla y un protagonista elfo. | Fanáticos de la Santa Pala (opcional) |
| **2** | **Audiencia en la abadía** (15') | El barón no puede pagar. Primeras pistas sobre Brea. *(Ver el diálogo de ejemplo.)* | — |
| **3** | **Hilos sueltos** (30') | Investigación libre: el libro de cuentas de Lisandro (cofre con trampa), las viudas, el sermón de Cirilo. Pista clave: aparece plata nueva en un pueblo cuya mina está cerrada. **Subes a nivel 4.** | — |
| **4** | **El Escorial y el Pozo del Ahorcado** (25') | Los **Sinpaga** (mineros convertidos en bandidos) controlan las escombreras. Encuentras el acceso de contrabando y ves al primer Callado. | Los Sinpaga: carro de aceite y altura de las escombreras |
| **D1** | **La noche de las antorchas** (15') | La Cuadrilla asalta la abadía. **Subes a nivel 5.** | Según lo que elijas |
| **5** | **La mina** (30') | Andamios y vagonetas en las galerías altas. Después, la Galería Sellada: los restos de los cuarenta, la mecha y el secreto de Garrán (D2). **Subes a nivel 6** antes de la Bóveda. | Callados en los andamios; emboscada en la Galería Sellada |
| **6** | **La Bóveda** (20') | Combate contra Brea. Si el protagonista es **elfo** o **enano**, puede descubrir con **[Historia] CD 13** el origen real de la enemistad entre las dos razas (sección 2). Después viene D3. | Jefe |
| **7** | **El cobro** (15') | Vuelves a la superficie con la escritura de embargo encima de la mesa. D4 y epílogo. | Posible combate contra Dorotea |

---

## 8. Decisiones y consecuencias

### D1. La noche de las antorchas

La Cuadrilla va a asaltar la abadía esta noche.

- **Unirte a la Cuadrilla:**
  - Combates contra la guardia. El barón cae prisionero y Nella quiere colgarlo de la Torre del Cepo; puedes intentar impedirlo.
  - Hilda huye con el **sello del barón**, que hace falta para el embargo.
  - Los mineros te guían a la mina por la entrada principal. La abadía te queda hostil.
  - Si eres elfo, los Hulla no luchan a tu lado salvo que superes **[Persuasión] CD 15**, con desventaja.
- **Defender la abadía:**
  - Combates contra mineros a los que ya conoces de nombre, Odda Hulla incluida. Nella muere o acaba presa.
  - El barón, agradecido, te da la **llave de la cripta**, que lleva a la mina por una ruta propia con encuentros distintos.
  - El pueblo se vuelve contra ti: la posada te sube los precios y la Santa Pala no te cura.
- **Mediar:**
  - Tirada de **[Persuasión] CD 16**. La CD baja a 12 si enseñas el libro de cuentas de Lisandro, porque así desvías la rabia hacia Brea.
  - Si sale bien, hay tregua. A cambio, el barón tiene que reconocer en público lo de los cuarenta, y Cirilo agita igualmente a los suyos: muere alguien que importa.
  - Si sale mal, se juntan los costes de las dos opciones anteriores.
- **No hacer nada:** a la mañana siguiente el barón está colgado, Hilda ha desaparecido con el sello y nadie te debe nada. Tampoco te ayuda nadie.

### D2. Treinta coronas

En la Galería Sellada encuentras la mecha y el pago apuntado en la nómina del barón. Dorotea ya lo sabía.

- **Encubrirlo:** Garrán sigue en el grupo. Dorotea lo apunta y lo usará como palanca contra ti en D4. En la Bóveda, Ivo reconoce a Garrán y él se bloquea un turno.
- **Obligarle a confesar al volver:** acepta. En la Bóveda pelea como quien ya no tiene nada que perder (obtiene una ventaja en combate). En el epílogo, Nella decide su destino, si sigue viva.
- **Echarlo:** baja solo a buscar a Ivo. Te lo encuentras en la Bóveda, malherido y en el bando de nadie. Puedes salvarlo durante el combate o no.

### D3. La Collera

Brea ha caído y la collera está en el suelo.

- **Destruirla:** la plata viva se queda inerte, la mina pierde casi todo su valor y el interés del banco se desploma. Los Callados quedan libres, pero el metal los ha consumido. Ivo tiene un momento de lucidez y se despide.
- **Ponértela:**
  - Ganas un objeto poderoso con una orden por combate (dominas a un enemigo durante un turno).
  - El coste es que oyes el canto: tienes desventaja en las salvaciones de Sabiduría y las curaciones de Fray Anselmo te sanan la mitad, porque «el dios no quiere tocarte».
  - Los Callados te siguen, Ivo incluido. Garrán no te lo perdona, o te lo agradece, y las dos cosas son igual de malas.
- **Sellar la mina:** usas la pólvora que queda. La Santa Pala lo celebra y el pueblo se queda sin futuro. Si Garrán está en el grupo, se queda abajo con Ivo y no sube.

### D4. El cobro

Dorotea pone la escritura de embargo sobre la mesa.

- **Ejecutar el embargo:** necesitas el sello del barón, o su cadáver. Cobras tu comisión y Dorotea queda libre. Hondonegra pasa a ser propiedad de la banca, con Lisandro como regente.
- **Darle la mina a la Cuadrilla:**
  - Necesitas la firma del barón o falsificarla (**[Engaño]**, con ventaja si eres pícaro).
  - Dorotea no queda libre. Si tienes las pruebas de la complicidad del banco, puedes ponerla de tu parte con **[Persuasión] CD 15**. Si no, se marcha, y te deja apuntado.
- **Refinanciar:** solo si el barón sigue vivo. Firma un préstamo nuevo con peores intereses. Todos viven y nadie es libre. Para Valcárcel es el final perfecto.
- **Quemar la escritura y llevarte la plata que puedas cargar:** sales rico y todo el mundo te odia. Dorotea cumple su orden sellada y el combate final es contra ella. Si Garrán y Anselmo te tienen aprecio, se quedan contigo.

### Epílogo

Una secuencia de viñetas sobre el destino del barón, Nella, Odda, Hilda, Cirilo, Lisandro, los Callados y cada compañero, según las cuatro decisiones. Cierra con un gancho para el acto II: **Valcárcel nunca envía un solo cobrador.**

---

## 9. Diálogo de ejemplo: audiencia en la abadía

*La sala capitular huele a cera barata y a hombre que no sale de casa. El barón Ulric Mazo come pasas de un plato de plata, el único que queda en la sala. Detrás de él, Hilda Cardo os mira como si os estuviera tomando medidas para el ataúd.*

> **MAZO:** El banco. Esperaba a alguien más alto.
> **DOROTEA:** La estatura del cobrador no altera el importe, excelencia. Cuatro mil coronas. Más intereses.
> **MAZO:** ¿Y a cuánto ascienden los intereses, si no es indiscreción?
> **DOROTEA:** A dos mil novecientas doce coronas con cuarenta. Los cuarenta céntimos se los perdono, por cortesía.
> **MAZO:** *(al protagonista)* ¿Y usted? ¿También habla con decimales, o ha venido a romperme algo?
> **FRAY ANSELMO:** Si esto va a acabar en sangre, recuerdo a los presentes que la extremaunción la cobro por adelantado. Por razones evidentes.
> **DOROTEA:** Le apunto, fray.
> **FRAY ANSELMO:** ¿Me apunta qué?
> **DOROTEA:** Todavía no lo sé. Por eso le apunto.

1. **[Persuasión] CD 14.** «Aquí nadie tiene que romper nada. Enséñeme las cuentas y buscamos una forma de que todos durmamos esta noche.»
2. **[Intimidación] CD 12.** «Vengo a romper lo que haga falta. Usted elige si empezamos por la vajilla o por los dedos.» *(Ventaja: Garrán está en el grupo.)*
3. **[Perspicacia] CD 13.** *(Mirar a Hilda en vez de al barón.)*
4. **[Mago] [Arcanos] CD 15.** *(Ese plato tiene algo raro.)*
5. **[Enano]** «Esta abadía rezuma agua. Lo noto en la piedra. Su mina, igual.»
6. **[Elfo]** «Conocí a su bisabuelo, excelencia. También debía dinero.»
7. **[Requiere: hablar con Nella]** «Cuarenta hombres bajaron a su mina, excelencia. ¿Cuántos ha visto subir?»
8. «Volveré cuando tenga algo mejor que ofrecer que pasas.» *(Salir.)*

**Opción 2, éxito**
```
[Intimidación]  d20 con ventaja: 9 · 15  →  15 + 1 (Carisma) = 16   vs CD 12   ÉXITO
```
> *Garrán se cruje los nudillos uno por uno. Tarda un buen rato. Tiene los nudillos grandes.*
> **MAZO:** *(se le cae una pasa)* No hay dinero. No hay nada. Brea me juró que la veta estaba muerta, y yo… yo firmo lo que me ponen delante. Es mi gran talento.
> **HILDA:** Excelencia.
> **MAZO:** Ya lo sé, Hilda. Me callo. Pero es que me lo han preguntado con muchísima convicción.
> → *flag `baron_confeso_brea`*

**Opción 2, fallo**
```
[Intimidación]  d20 con ventaja: 3 · 8  →  8 + 1 (Carisma) = 9   vs CD 12   FALLO
```
> **HILDA:** En esta sala hay seis ballestas, cobrador. Usted ha contado dos.
> **GARRÁN:** *(en voz baja)* Cinco. La sexta está detrás del tapiz y no está cargada.
> **HILDA:** …Cinco.
> **MAZO:** ¿Lo ve? Esto es lo que pasa cuando se levanta la voz. Que todos acabamos sabiendo cosas.
> → *la guardia de la abadía pasa a desconfiar; la próxima audiencia tiene CD +2*

**Opción 3, éxito**
> *Hilda tiene la mano en la daga desde que has entrado. Pero no te apunta a ti. Apunta a la nuca del barón.*
> → *flag `hilda_sopesa_traicion`*

**Opción 4, éxito**
> *El plato zumba. No se oye: es un picor detrás de los ojos, como una canción que no recuerdas haber escuchado.*
> **MAZO:** ¿Le gusta? Me lo regaló Brea. «Por los buenos tiempos», dijo. Qué detalle, ¿verdad? Ya nadie tiene detalles.
> → *flag `pista_plata_viva`*

**Opción 6**
> **MAZO:** ¿Mi bisabuelo? ¿Y pagó?
> **ELFO:** Con intereses. Tardó cuarenta años. Yo tenía tiempo.
> **MAZO:** *(pausa larga)* Hilda, ¿cuántos años vive un elfo?
> **HILDA:** Más que usted, excelencia.
> → *flag `elfo_conocia_bisabuelo` (desbloquea una réplica de Lisandro en la escena 3)*

---

## Anexo A: guion del prólogo cinemático

> **Aprobado (2026-10-17).** El guion completo, con sus 10 viñetas, está en [`docs/intros/INTERESES.md`](intros/INTERESES.md). La hoja de previsualización está en [`docs/art-previews/intereses-intro.png`](art-previews/intereses-intro.png). Falta el reproductor de cinemáticas (Fase 6).

---

## Registro de cambios

- 2026-10-17: aprobado el guion del prólogo cinemático (anexo A).
- 2026-10-17: la progresión pasa a ser de **nivel 3 a 6** (antes, de 1 a 4).
- 2026-10-16: se añade como anexo pendiente el guion del prólogo cinemático (onboarding, Fase 6).
- 2026-10-16: historia aprobada. Se añade **Elfo** como raza jugable, con la enemistad entre elfos y enanos integrada en la trama (clan Hulla, Lisandro elfo y el origen en la Bóveda).
