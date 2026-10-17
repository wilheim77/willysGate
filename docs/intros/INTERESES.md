# Intereses: guion del prólogo cinemático

> Estado: **aprobado por el usuario (2026-10-17)**. Es el anexo A de `docs/STORY.md`.
>
> Viñetas generadas: `content/intereses/public/assets/cinematics/`. Datos para el reproductor: `content/intereses/cinematics/intro.json` (se genera desde `intro.spec.json` con `npm run art`). Hoja de previsualización: [`docs/art-previews/intereses-intro.png`](../art-previews/intereses-intro.png).

## Requisitos

- **Duración:** 1:20 aproximadamente. Se puede saltar desde el primer segundo.
- **Tono:** seco y cínico desde la primera línea. Ni épica ni elegidos: un trabajo de cobro, contado por alguien que ya ha visto muchos.
- **Contenido:** el Ducado y la Casa Valcárcel; Hondonegra, pueblo minero de plata que se muere; la deuda del barón Ulric Mazo; por qué está ahí el protagonista (cobrador al 10 %) y Dorotea vigilando.
- **Arte:** viñetas de 320×180 con el pixel de 0x72 (16 px), sprites del juego (el cobrador, Dorotea, guardias) y fondos procedurales. Paleta fría, parda y desaturada; el único color cálido es el de las velas y las ventanas. El filtro de color de la cámara se aplica en tiempo de ejecución.
- **Voz:** sin locución. Texto con máquina de escribir y el mismo «bla-bla» sintetizado que el reproductor use para *Willy*, más grave y lento. El narrador no tiene nombre: es la voz del oficio.

## Guion

| # | Se ve | Texto | Duración | Efecto |
|---|---|---|---|---|
| 1 | Un escritorio a la luz de una vela: un libro de cuentas abierto, monedas apiladas, una pluma. | En el Ducado todo tiene precio. Lo que no tiene precio, tiene intereses. | 7 s | Fundido desde negro |
| 2 | La fachada de la Casa Valcárcel de noche: columnas, escalinata, dos guardias, estandartes. | La Casa Valcárcel es la banca más respetada del Ducado. / Es respetada porque nadie que le debiera dinero ha vivido lo bastante para hablar mal de ella. | 9 s | Paneo lento hacia arriba |
| 3 | El valle de Hondonegra al atardecer: montes, la escombrera, el castillete de la mina, casas apiñadas y el río gris. | Hondonegra. Un valle, una mina de plata y un río gris del que nadie bebe dos veces. | 7 s | Paneo lento a la derecha |
| 4 | El mismo pueblo de cerca, de noche: pocas ventanas encendidas, la Torre del Cepo con su horca recortada contra el cielo. | La mina lleva ocho meses cerrada. El pueblo se muere despacio y en orden, como se muere todo lo pobre. | 8 s | Estático; parpadeo de ventanas |
| 5 | La abadía vieja en lo alto, con una sola ventana iluminada. Dentro, la silueta del barón escribiendo. | El barón Ulric Mazo vive en la abadía vieja. Es culto, cobarde y escribe una poesía espantosa. | 8 s | Zoom suave a la ventana |
| 6 | Primer plano del pagaré: «4.000 coronas», el sello de Valcárcel y, debajo, una cifra que no deja de crecer. | También debe cuatro mil coronas a la Casa Valcárcel. / Más intereses. Los intereses son lo único del valle que todavía trabaja. | 8 s | La cifra de abajo sube; temblor leve al final |
| 7 | Un camino entre colinas grises al anochecer. Dos figuras pequeñas: el cobrador delante, Dorotea detrás. | Tú cobras a comisión. Si cobras, te quedas el diez por ciento. / Si no cobras, te quedas el viaje. | 8 s | Paneo lento a la derecha |
| 8 | Dorotea de cerca, con su libro abierto, mirando a cámara sin pestañear. | Dorotea Vane, contable del banco, viene a comprobar que la plata llegue entera. / Apunta todas las deudas. También las morales. | 8 s | Estático |
| 9 | La bocamina principal: vigas, oscuridad y, muy al fondo, un brillo plateado. | Nadie en Hondonegra habla de la mina. Eso debería preocuparte más que el barón. | 7 s | Fundido; el brillo late una vez |
| 10 | Título: **INTERESES**, y debajo «Acto I: Hondonegra». | Todo se paga. Casi nunca lo paga quien firmó. | 6 s | Fundido a negro al final |

**Total:** 76 s.

## Notas para la aprobación

- La viñeta 9 insinúa el secreto (la plata viva) sin contarlo. Si se prefiere no dar pistas, se sustituye por un plano de la plaza con la horca y la frase «En Hondonegra ya no queda dinero. Queda hambre, una horca y opiniones».
- La frase de cierre es el tema del acto tal como figura en `docs/STORY.md`.
- Garrán y Anselmo no salen: se presentan en el propio juego (cuneta del camino y plaza).
