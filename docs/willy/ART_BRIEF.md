# Willy: encargo de arte

> Para la sesión de arte. Fecha: 2026-10-17. Lo enviado por mensaje es un resumen de este documento.
> Restricciones: **no se compra arte**. Base: 0x72 DungeonTileset II y Ninja Adventure (CC0), Kenney (CC0) y arte propio. Pipelines reproducibles en `scripts/art/`; todo lo nuevo, en `CREDITS.md` / `TODO-ART.md`.

## Estilo y formato

- **16 px por tile**, pixel art del mismo tamaño que 0x72 (personajes de unos 16×24-28 px sobre la casilla, pivote en los pies).
- **2 direcciones** (derecha; la izquierda es el volteo). 4 direcciones solo si sale gratis de Ninja Adventure.
- **Animaciones mínimas por personaje:** `idle` (2-4 frames) y `run` (4 frames). El ataque, el golpe y la muerte se hacen por código; si alguna clase necesita un frame clave, se indica.
- **Tono:** colorido y luminoso (concurso de televisión), no grimdark. Paleta propia de *Willy*: más saturada que *Intereses*; rojo «EN DIRECTO» y neones del plató como acentos.
- **Dónde:** especificación en `content/willy/art/<preset>/` (preset `ninja`) y lo generado en `content/willy/public/assets/<preset>/` con su manifiesto en `content/willy/assets/<preset>.json` (mismo esquema que *Intereses*). No tocar `content/willy/cinematics/` salvo para el prólogo, que ya es tuyo.
- **Ids:** usa como `spriteId` los ids de los datos (`classes.json`, `rivals.json`, `floors.json`).

## Prioridades

### P1. Willy y el primer nivel jugable (Planta 1 + Camerino)

1. **Willy humano**, base común: treintañero corpulento, bigote, gorra, mono naranja. Y **una variante por clase** (cambio de ropa o accesorio, misma silueta):
   | `spriteId` | Clase | Rasgo visual |
   |---|---|---|
   | `willy-butanero` | Butanero | Mono naranja con bombona a la espalda (la de serie) |
   | `willy-influencer` | Influencer | Chaqueta brillante, palo de selfie |
   | `willy-bardo-de-verbena` | Bardo de verbena | Camisa de orquesta, teclado colgado |
   | `willy-socorrista` | Socorrista | Bañador rojo y camiseta amarilla, silbato |
   | `willy-tasador` | Tasador | Chaleco, monóculo, guantes blancos |
   | `willy-mimo` | Mimo | Cara blanca, camiseta de rayas |
   | `willy-ingeniero` | Ingeniero | Casco con antena, mono gris, soldador |
   | `willy-funcionario` | Funcionario | Camisa, corbata, manguitos y sello en la mano |
   | `willy-jugador-de-basket` | Jugador de basket | Camiseta de tirantes del Brazomar, cinta de pelo, balón. **Más alto** (2-4 px más) |
2. **Enemigos de la Planta 1:** `gaviota-de-lonja`, `rata-portuaria`, `cangrejo-con-casco`, `bocarte-andante`, `mimico` (cofre con dientes; 0x72 tiene base).
3. **Tiles de Castro Sumergido:** suelo de piedra mojada, agua por los tobillos, muelle y bordes con caída, soportales, lonja; muros con cara para la vista 3/4.
4. **Camerino:** espejos con bombillas, moqueta, mostrador de Maripuri, barra del Bar Paco, mesa de Xelda, ascensor de servicio. PNJ: `maripuri`, `paco`, `koldo`, `xelda` (alienígena de cuatro brazos).
5. **Cajas de botín** de 4 niveles (bronce, plata, oro, legendaria): sprite cerrado y abierto, 16×16; y el marco de carta por rareza (UI).

### P2. Concurso y combate

6. **Invocaciones:** `automata-repetidor` (cubo de chapa con patas y antena, luz verde), `antena-repetidora` (mástil, 16×32), `chencho-el-base` (bajito, rápido, camiseta del Brazomar), fans de la Influencer.
7. **Utilería del plató (se usa en todas las plantas):** focos móviles y su cono de luz, cámaras-dron, cartel «EN DIRECTO», barriles, carritos, parrilla de focos.
8. **Superficies propias:** expedientes (papeles por el suelo) y su versión en llamas, canicas, vapor, agua electrificada (las comunes ya vienen del motor).
9. **Efectos (partículas por código si es más fácil):** arco voltaico, ondas «G» del Ingeniero (de un pitido triste en 5G a un estallido en 10G), impresos voladores del Funcionario, balón con estela.
10. **HUD del concurso:** contador de audiencia, retratos de los 6 patrocinadores (32×32; Butanos Hermanos Pérez, Seguros La Prudente, Lord Vórtax, Mamá Clementina, La Colmena, Glorp Ecosoluciones), reloj de planta, iconos de estado. Tipografía: Press Start 2P en títulos, VT323 en texto.

### P3. Rivales y resto de plantas

11. **Mazmorreros rivales** (`rivals.json`): `rival-vanesa` (semigaviota), `rival-ceferino` (gnomo de jardín de cerámica, gorro rojo), `rival-gorka` (orco con corbata), `rival-mariluz` (fantasma translúcida, amable), `rival-asterio` (minotauro grande, 2 tiles de alto).
12. **El Presentador** (jefe final, `jefe-presentador`): señor elegante, traje impecable, sonrisa de presentador, siempre igual; vampiro alienígena sutil (piel algo pálida, colmillos discretos, un brillo raro en los ojos). Variante «nube de murciélagos con micrófono» para la fase 2. Arena: atriles, panel de preguntas, baldosas de colores. **Homenaje cariñoso**: caricatura amable, sin parecido fotográfico ni nada ofensivo.
13. **Biomas 2-5 y sus jefes:** Hipermercado Eterno (Doña Rebeca), Verbena (Gigantón de 4 m, cabezudos), Balneario Glaciar (Socorrista Abisal, patitos gigantes), El Plató. Los jefes grandes pueden ser escalados ×2 con retoque.

## Qué no hace falta

- Animaciones de ataque, golpe y muerte (por código).
- Versiones de 4 direcciones.
- Arte de razas como variantes de Willy: Willy siempre es humano; las razas son solo los rivales del punto 11.
