# Willy el mazmorrero: tres premisas

> Estado: **propuesta, pendiente de que el usuario elija** (Fase 0 de *Willy*, 2026-10-17).
> Lo único fijado de antemano: el título, que es un juego de mazmorras, que tiene **cajas de botín**, **logros con mucho texto** y **generación procedural**, y que su arte es más amable que el de *Intereses*.

Las tres reutilizan el motor táctico por turnos (cuadrícula ortogonal, vista cenital 3/4, altura, superficies, iluminación, RNG con semilla). Lo que cambia es el bucle de juego y cuánto trabajo nuevo pide al motor.

---

## A. «Mazmorrero en prácticas» (roguelite táctico por jornadas) ⭐ recomendada

**Quién es Willy.** El becario recién contratado del **Gremio de Mazmorreros, Trampistas y Afines**, la gente que mantiene las mazmorras entre visita y visita de los aventureros: rellena cofres, rearma trampas, barre esqueletos y saca a los monstruos asilvestrados. Willy quiere una sola cosa: **sacarse la plaza fija**.

**El mundo.** La Gran Mazmorra de Torrebarro **se recoloca sola cada noche** (nadie sabe por qué, y el Gremio cobra por no saberlo). Eso justifica la generación procedural desde la primera línea.

**El bucle.** Cada partida es una **jornada**: bajas plantas generadas al azar, con combates tácticos por turnos, trampas y **Cajas de Objetos Perdidos** (lo que se dejan los aventureros). Si caes, te «dan de baja» y vuelves a la oficina. Entre jornadas cobras **horas extra**, desbloqueas herramientas en el **Convenio** y engordas tu **Expediente** de méritos (los logros).

**Tono.** Comedia de oficina con fantasía: burocracia española, sellos, circulares, «vuelva usted mañana». Pratchett con un toque de *El Ministerio del Tiempo*. Nadie muere de verdad: los monstruos acaban fuera de combate y se barren.

**Por qué es divertido.** Partidas cortas (30-45 min) que se pueden jugar en el móvil; cada jornada es distinta; el combate táctico importa porque el empujón a un foso o el aceite + antorcha te salvan la planta. Las cajas y los logros encajan en la propia historia: abrir objetos perdidos y acumular méritos **es el trabajo**.

**Arte.** Ninja Adventure (CC0, 16 px, 4 direcciones, monstruos, efectos, música y sonido) como base; 0x72 (CC0, 16 px) para muros de mazmorra si hace falta. Tiny Swords no encaja aquí (64 px y sin interiores).

---

## B. «La mazmorra de la tía Encarna» (gestión y defensa)

**Quién es Willy.** Un sobrino sin oficio que **hereda la mazmorra** de su tía abuela Encarna, con deudas, un dragón jubilado y un lich que exige trienios.

**El bucle.** Dos fases que se alternan:
- **De día** construyes salas a partir de plantillas, contratas monstruos y colocas trampas.
- **De noche** llegan partidas de aventureros generadas al azar, y **tú controlas a los defensores** en combate táctico.

Cavar hacia abajo descubre zonas procedurales con recursos. Las cajas de botín son lo que sueltan los aventureros derrotados.

**Tono.** Dungeon Keeper al revés y en clave familiar: herencias, vecinos, el ayuntamiento que quiere licencia de obra.

**Por qué es divertido.** Ver cómo tu diseño de mazmorra aguanta (o no) el asalto; los aventureros son el enemigo y tienen nombre y personalidad.

**Arte.** Tiny Swords y Tiny Swords Enemy Pack (64 px, ejércitos coloridos, terreno con niveles de altura), más LimeZu para interiores. **Riesgo:** pide un modo construcción, economía y una IA de asaltantes; es el que más trabajo nuevo exige al motor y al cliente.

---

## C. «Mazmorrero a domicilio» (encargos en una ciudad moderna)

**Quién es Willy.** Un autónomo con furgoneta en una ciudad española de hoy, donde **las mazmorras brotan en sótanos, trasteros y garajes** como las humedades. Willy las limpia a domicilio, con factura y sin IVA si se paga en efectivo.

**El bucle.** Desde su piso-oficina (el **hub**) acepta encargos de un tablón: cada encargo es un sótano generado por procedimiento, más o menos profundo. Personaje persistente con niveles (sin muerte permanente), furgoneta mejorable y clientes recurrentes con sus manías.

**Cajas de botín.** Las **cajas del trastero** que nadie reclama.
**Logros.** Las **reseñas de clientes** en una app de valoraciones, con estrellas y muchísimo texto.

**Tono.** Costumbrismo cómico (Mortadelo, *Aquí no hay quien viva*): comunidades de vecinos, porteras, la cuñada que lo sabe todo.

**Por qué es divertido.** El contraste entre lo cotidiano y lo fantástico; cada cliente es un chiste con patas; las partidas son cortas y episódicas.

**Arte.** LimeZu Modern Interiors/Exteriors (de pago, 16 px) para la ciudad y los sótanos, y monstruos de Ninja Adventure (CC0, 16 px). **Riesgo:** depende de comprar LimeZu y revisar su licencia; los sótanos modernos necesitan muchas plantillas propias.

---

## Comparativa

| | A. En prácticas | B. Tía Encarna | C. A domicilio |
|---|---|---|---|
| Bucle | Roguelite por jornadas | Gestión + defensa | Encargos con personaje persistente |
| Reutiliza el combate táctico | Total | Parcial (control de defensores) | Total |
| Trabajo nuevo en el motor | Medio (procedural, inventario, perfil) | Alto (construcción, economía, IA de asalto) | Medio (procedural, hub, niveles) |
| Las cajas de botín encajan | Sí: son el oficio | Sí: botín de aventureros | Sí: trasteros |
| Los logros encajan | Méritos del Expediente | Cartas del ayuntamiento | Reseñas de clientes |
| Arte | Gratis (Ninja Adventure + 0x72) | Tiny Swords (gratis) + Enemy Pack (pago) | LimeZu (pago) + Ninja Adventure |
| Partida en el móvil | Ideal (30-45 min) | Media | Buena |

## Recomendación

**A. «Mazmorrero en prácticas».**

1. Es la que mejor reutiliza lo que ya hace el motor (combate táctico, altura, superficies, luz) sin pedir un modo de juego nuevo.
2. La generación procedural, las cajas y los logros **salen de la premisa** en vez de pegarse encima.
3. El arte es gratis, CC0 y del mismo tamaño que el de *Intereses* (16 px), así que los pipelines y el render ya sirven.
4. Las partidas cortas cuadran con jugar desde el móvil.

La elección es del usuario. Si gusta más B o C, el diseño de procedural, cajas y logros de [`DESIGN.md`](DESIGN.md) se puede trasladar casi entero; solo cambian el bucle y la ambientación.
