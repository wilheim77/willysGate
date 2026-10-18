# Mapas de *Intereses*

> Agente de mapas, rama `mapas`. Los siete mapas del acto, en orden de historia. Peticiones a la sesión principal: [`ENGINE_REQUESTS_INTERESES.md`](ENGINE_REQUESTS_INTERESES.md).

## Fuentes y herramientas

- **Fuentes:** `scripts/maps/src/<n>-<id>.mjs` pinta cada mapa con rectángulos o ASCII (`scripts/maps/paint.mjs`) y declara los spawns, luces, superficies, trampas, encuentros, salidas y zonas. `node scripts/maps/build.mjs [id]` escribe `content/intereses/maps/<id>.json` (Tiled, tileset incrustado). Mientras un mapa tenga fuente, se edita la fuente: si lo retocas en Tiled, borra la fuente para que no se sobrescriba.
- **Tileset lógico:** `scripts/maps/tileset.mjs` contiene 56 tiles: los interiores (piedra, tierra, escoria, tablones y bóveda de h0 a h3, andamio de h1 a h3, raíles en h0, muro y puertas) y los exteriores (`scrub`, `rock`, `cobble` y `slag_heap` de h0 a h3, `road`, `road_v` y `mud` en h0-h1, `river`, `riverbank`, `fence` en h1, y `house`, `house_plain` y `stone_wall` como muros). Cada fuente pinta primero con los caracteres básicos y luego aplica `retile` para poner el arte exterior. Los 11 primeros coinciden con `test.json`. `npm run gen:logic-tiles` regenera `terrain-logic.png`.
- **Vista previa:** `node scripts/maps/dump.mjs [id]`. A la izquierda va el terreno con los marcadores y a la derecha las alturas (`#` = no transitable). Terreno: `.` piedra, `,` tierra, `;` escoria, `=` tablones, `H` andamio, `-`/`|` raíles, `v` bóveda, `s` matorral, `k` roca, `c` adoquín, `S` escoria de escombrera, `R`/`I` camino, `m` barro, `~` río, `b` orilla, `f` valla, `h`/`g` casa, `W` muro de piedra, `#` muro, `+`/`/` puerta cerrada/abierta. Marcadores: `@` héroe, letras = spawns (listados debajo), `o` barril de aceite o de pólvora, `u` barril, `x` caja, vagoneta o carro, `c` cofre, `l` palanca, `d` puerta usable, `r` resonador, `O` pozo, `T` horca, `t` tapiz, `f` mecha, `k` restos, `p` polea, `i` inscripción, `*` luz, `^` trampa, `E` salida, `%` aceite, `w` agua y `&` escombros.
- **Test:** `tests/content/maps.test.ts` comprueba:
  - que los spawns estén en casillas transitables y que no haya dos en la misma;
  - que con el movimiento de 5e (un nivel por paso) se llegue desde la entrada a todas las criaturas y al lado de todos los objetos;
  - que las luces y las zonas estén dentro del mapa;
  - que las trampas tengan todos sus parámetros;
  - que las superficies existan;
  - que los participantes de cada encuentro tengan spawn;
  - que cada salida apunte a un mapa y un spawn que existen, desde una casilla alcanzable, y que a cada mapa se pueda llegar por alguna salida;
  - que de cada derrumbe se pueda volver a la entrada;
  - que los diálogos y hablantes de las escenas existan y nadie esencial esté en un `fight`;
  - que las marcas de `requiresFlag`/`unlessFlag` estén en `flags.json` (o sean `TODO:`);
  - que las salidas hacia delante en la historia lleven su marca (`STORY_GATES`);
  - y una sonda: si se tapia una escena `gate`, sus salidas protegidas (`protects`) quedan fuera de alcance.

  Las puertas `door_closed` cuentan como transitables solo si tienen encima un spawn `door-*`.

## Convenciones

- **Capas:** `ground`, `spawns`, `lights` (con `prop`: `torch_wall` o `brazier`), `surfaces`, `traps` (`detect`, `save`, `dc`, `damage`, `type`, `condition`, `turns`, `half`, `surface`, `disarmCheck`, `disarmDc`), `encounters` (`participants`, opcional `requiresFlag`), `exits` (`to`, `spawn`, opcional `requiresFlag`), `scenes` (`dialogue`, `speaker`, `once`, `fight`) y `collapse` (`height`, `terrain`, `trigger`). Las trampas llevan `marker` (`trap_beartrap`, `trap_tripwire`, `trap_dart`, `trap_rotten_plank`). `camino` tiene la propiedad de mapa `start`.
- **Nombres de spawn:**
  - `hero` y el grupo solo en el mapa inicial;
  - `entry-<origen>` para llegar desde otro mapa;
  - el id de `cast.json` para los PNJ con nombre;
  - `<plantilla>-<n>` para las criaturas genéricas;
  - `<prop>-<n>` para el decorado (`barrel_oil`, `crate`, `oil_cart`, `well`, `campfire`, `gallows`, `mine_wagon`, `powder_keg`, `resonator`...);
  - `chest|lever|door-<id>` para los usables;
  - `todo-<algo>` para lo que falta definir.
- **`TODO:`** delante de un diálogo o una marca indica que el guion aún no lo ha definido.
- **Diseño:**
  - toda casilla obligatoria es alcanzable;
  - ningún avance depende de una sola tirada (dos puertas para el libro de Lisandro, tres entradas a la mina, un rodeo para evitar a los Sinpaga);
  - las caídas útiles son de 2 o más niveles (h3 sobre h1, o h2 sobre h0);
  - las salas oscuras tienen luz ambiente baja y candiles.

## Combates tácticos (lista de comprobación)

Cada zona de combate se declara en la capa `arenas` (rectángulo; `tutorial: true` para el tutorial). El test `tests/content/maps.test.ts` exige que todo encuentro o escena con `fight` caiga en una arena, y que cada arena tenga al menos 4 casillas que bloqueen (muros, rocas, props obstáculo), algún desnivel y, salvo el tutorial, un peligro (barril de aceite o de pólvora, aceite o agua, o una caída de 2 niveles). Al diseñar:

1. **Cobertura.** De 3 a 6 obstáculos que corten paso y visión (muros bajos, carros, cajas, escombros, columnas, árboles, pozos), agrupados en posiciones legibles y con pasillos entre ellos.
2. **Altura.** Al menos una posición elevada (cornisa, andamio, balcón, escalera, rocas, escombrera), a la que se suba por escalera o rampa, de modo que cueste movimiento. En 5e, atacar desde arriba da ventaja (`resolve.ts`, «desde arriba»). Los tiradores enemigos van arriba, y el jugador tiene una ruta para flanquearlos.
3. **Paso estrecho y flanco.** Una puerta, un puente o la boca de un callejón que se pueda sostener, y una ruta más larga que lo rodee.
4. **Peligros cerca de los enemigos.** Barriles de aceite (estallan con 1 de daño), braseros, cornisas desde las que empujar, agua o fosos. Entre 1 y 3 por combate, puestos a propósito.
5. **Posiciones iniciales.** Los cuerpo a cuerpo delante; los tiradores detrás o en alto. El grupo entra por un lado que le deja elegir, no en línea recta.
6. **Legibilidad.** Lo que bloquea tiene que parecer que bloquea: las vallas y los acantilados (`C` con altura 4) no son transitables, y las escaleras usan las caras nuevas de escalón.

## Mapas

### `camino`

**P · El camino.** El último tramo del camino al valle, al atardecer (40×20). Primero viene el **combate tutorial**: dos perros carroñeros y una rata sobre una mula muerta, con el carro roto y un muro de piedra como cobertura y un altozano como posición elevada; la franja va de lado a lado, así que siempre ocurre. El grupo empieza al oeste con Dorotea, y el camino va elevado (h1). Al sur está la cuneta (h0) donde espera Garrán. Al este, los mineros hambrientos (ids de `cast.json`) cortan el paso junto a un carro volcado: cajas, un barril de aceite y aceite derramado. Hay una hoguera (`campfire`). Un vigía sube a un peñasco de escoria (h3); quien lo empuje por su cara sur lo hace caer 2 niveles. Para el tutorial hay un charco en el camino, una caja que hace de primera cobertura y un cepo de furtivo fácil (detección 10). Dos franjas `scenes` de lado a lado del mapa (`gate`) hacen inevitables a Garrán (`camino_garran`) y a los mineros (`camino_mineros`); el combate se puede evitar hablando. La salida este lleva a la plaza y exige `prologo_mineros_resuelto`.

```
== camino: El camino (40x20, ambient 0.6)
kkkkkkkkkkkkkkkkkkkEEkkkkkkkkkkkkkkkkkkk   ###################22###################
ssssssssssssssssssssssssssssssssssssssss   2222222222222222222222222222222222222222
ssssssssssssssssssssssssssssssssssssssss   1111111111111111111111111111111111111111
sssssssssssssssssssCs*ssskkkkkksssssssss   1111111111111111111111111233332111111111
ssssssssssssssssssssssssskkkkkksssssssss   1111122221111111111111111233332111111111
ssssssssssssssssssssss^sskkQkkksssssssss   1111122221111111111111111233332111111111
sssssssssssssssssssssKssskkkkkksssssssss   1111122221111111111111111233332111111111
ssssssssxsssskksssssssssskkkkkkssLLLss*s   111111111111133111111111123333211###1111
ssssssssIsDssssssssssssssssssssssssRRRRE   1111111111111111111111111111111111111111
RR@RRRRRRbbRRRRRRRRRRRwwRRRRRRNRRRRRRBRE   1111111111111111111111111111111111111111
RRARRRRRRRRFRRRRRRRRRRwwRRRRRRRORRRRRRRE   1111111111111111111111111111111111111111
sssssssssGsssssssssssssssssssssssssRRRRE   1111111111111111111111111111111111111111
sssssssssssLLLsmmmmmmmssssssxxsxPsssss*s   11111111111###10000000111111111111111111
ssssJssssssssssmmmMmmmsskssss%o%ssssssss   1111111111111110000000113111111111111111
sssssssssssssssmmmmmmmssskssssssss*sssss   1111111111111110000000111311111111111111
ssssssssssssssssssssssssssmmmmssssssssss   1111111111111111111111111100001111111111
ssssssssssssssssssssssssssmmmmsssssLssss   1111111111111111111111111100001111111111
ssssssssssssssssssssssssssssssssssssssss   1111111111111111111111111111111111111111
ssssssssssssssssssssssssssssssssssssssss   2222222222222222222222222222222222222222
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   ########################################
^ cepo-furtivo (22,5) {"marker":"trap_beartrap","detect":10,"save":"dex","dc":11,"damage":"1d6","type":"piercing","condition":"restrained","disarmCheck":"sleight_of_hand","disarmDc":10}
E a-hondonegra (39,8) -> plaza:entry-camino
E a-barranco (19,0) -> barranco:entry-camino
@ hero (2,9)
A dorotea (2,10)
B entry-plaza (37,9)
C entry-barranco (19,3)
D perro_carronero-1 (10,8)
F perro_carronero-2 (11,10)
G rata_gigante-1 (9,11)
I sacks-1 (8,8)
J dead_tree-1 (4,13)
K dead_tree_b-1 (21,6)
L dead_tree_c-1 (35,16)
M garran (18,13)
N minero_cabecilla (30,9)
O minero_hambriento_3 (31,10)
P minero_hambriento_1 (32,12)
Q minero_hambriento_2 (27,5)
props: crate-1, oil_cart-1, crate-3, crate-4, barrel_oil-1, campfire-1
encounter perros-carroneros: perro_carronero-1,perro_carronero-2,rata_gigante-1
scenes garran-en-la-cuneta (15,1 1x18) {"dialogue":"camino_garran","speaker":"garran","once":true,"gate":true,"protects":"a-hondonegra"}
scenes mineros-cortan-el-paso (23,1 1x18) {"dialogue":"camino_mineros","speaker":"minero_cabecilla","once":true,"gate":true,"protects":"a-hondonegra","fight":"minero_cabecilla,minero_hambriento_1,minero_hambriento_2,minero_hambriento_3"}
arenas perros-carroneros (5,4 10x9) {"tutorial":true}
arenas mineros (23,2 15x16) {}
```

### `barranco`

**P · Barranco de las Cabras (opcional).** Sale del camino por una senda de cabras al norte. Es un barranco seco que sube hasta una hondonada donde una manada de lobos ha arrastrado a un viajero (su cofre sigue allí). Hay dos maneras de subir: el cuello estrecho del cauce, que los lobos pueden sostener, o la cornisa larga del este (h2), que pasa por un espolón h3 justo encima del cuello; desde el espolón se puede empujar a un lobo. En la hondonada cruza un arroyo (agua).

```
== barranco: Barranco de las Cabras (28x20, ambient 0.45)
kkkkkkkkkkkkkkkkkkkkkkkkkkkk   ############################
kkkkkksssssssssssssssskkkkkk   ######1111111111111111######
kkkkkksc*Dsssssskssssskkkkkk   ######1111111111#11111######
kkkkkksswwwwwwwwwwwssskkkkkk   ######1100000000000111######
kkkkkksssssssssssssssskkkkkk   ######1111111111111111######
kkkkkkssKssksssssssJsskkkkkk   ######11111#1111221111######
kkkkkksssssBssCssssssskkkkkk   ######1111111111221111######
kkkkkkkkkkkksskkkkkkkkkkkkkk   ############11##33##########
kkkkkkkkkkkkssssFkkkkkkkkkkk   ############111133##########
kkkkkkkksssssskkkkkkkkkkkkkk   ########111111##33##########
kkkkkkkksssssskksskkkkkkkkkk   ########111111##22##########
kkkkkkkksGsssskk&&kkkkkkkkkk   ########111111##22##########
kkkkkkkksssssskk&&kkkkkkkkkk   ########111111##22##########
kkkkkkkksssssskksskkkkkkkkkk   ########111111##22##########
kkkkkkkkkksssssssskkkkkkkkkk   ##########11111122##########
kkkkkkkkkkssssIskkkkkkkkkkkk   ##########111111############
kkkkkkkkkksssssskkkkkkkkkkkk   ##########111111############
kkkkkkkkkkssAssskkkkkkkkkkkk   ##########111111############
kkkkkkkkkkkksskkkkkkkkkkkkkk   ############11##############
kkkkkkkkkkkkEEkkkkkkkkkkkkkk   ############11##############
E a-camino (12,19) -> camino:entry-barranco
A entry-camino (12,17)
B lobo-1 (11,6)
C lobo-2 (14,6)
D lobo-3 (9,2)
F lobo-4 (16,8)
G dead_tree-1 (9,11)
I dead_tree_b-1 (14,15)
J rubble_pile-1 (19,5)
K rubble_pile_b-1 (8,5)
props: chest-viajero
encounter lobos: lobo-1,lobo-2,lobo-3,lobo-4
arenas lobos (6,1 16x14) {}
```

### `plaza`

**1 · La plaza.** La Torre del Cepo con el cadalso, una plataforma h2 con escalones a ambos lados: allí están Anselmo, Cirilo y tres fanáticos de la Santa Pala, y la zona `juicio-anselmo` (tras `plaza_llegada`). El suelo es de barro, con un pozo y la horca como props. Junto al Pico Roto esperan Nella, Odda y un minero; al pie del camino de la abadía, dos guardias. Hay una terraza de mercado (h1) con cajas, aceite de lámpara junto al cadalso y un abrevadero. Cuatro salidas: el camino (oeste), la abadía (norte, con `audiencia_concedida`), las calles (este, con `juicio_resuelto`) y el Escorial (sur, con `audiencia_hecha`). El juicio no puede acabar en pelea contra Cirilo (es esencial).

```
== plaza: La plaza de Hondonegra (30x22, ambient 0.5)
ghghghghghghghghghghgWEEEEWhgh   ######################3333####
hghghghghghghghghghghWccccWghg   ######################2222####
ghghghghghghghghghghgWcBccWhgh   ######################2222####
hghghghgWWWWhghghghghWc*ccWghg   ######################1111####
gRRRRRRRWWWWRRRRRRRRRRcPccghgh   #0000000####00000000001111####
hRRRRRRRWWWWRRRRRRRRRRRRRQhghg   #0000000####00000000000000####
gRRRRRR==TF==G=RRRRRRRRRRRghgh   #0000001222222100000000000####
hRRRRRR========RRRRRRRRRRRhghg   #0000001222222100000000000####
gRRRRRK*RRRRRRRoRRRRRRRRRRRR*E   #00000000000000000000000000000
hccc*cRRIRRRRJ*RRRRRRRRRRRRCRE   #11111000000000000000000000000
gcRcScRRRRRRRRRRRRRRRRRRRRRR*E   #11111000000000000000000000000
hcucccRRRRRuTURRRRRRRRRRRghghg   #111110000000000000000000#####
gcccccRRRRRRRRRRROR*RRRLR*ghgh   #111110000000000000000000#####
h*RRRRRRRRRRRRRRRRRuRRRRMghghg   #000000000000000000000000#####
ERRRRRRRRRRRRRRRwwwRRRNRRhghgh   0000000000000000000000000#####
ERARRRRRRRRRRRRRRRRRRRRRR/hghg   00000000000000000000000000####
ERRRRRRRRRRRRRRRRRRRxRRROhghgh   0000000000000000000000000#####
hRRRRRRRRRRRRRRRRRRRRRRRRghghg   #000000000000000000000000#####
gRRRRRRRRRR*RRR*RRRRRRRRRhghgh   #000000000000000000000000#####
hghghghghghgIDIghghghghghghghg   ############000###############
ghghghghghghIIIhghghghghghghgh   ############000###############
hghghghghghgEEEghghghghghghghg   ############000###############
E a-abadia (22,0) -> abadia:entry-plaza
E a-calles (29,8) -> callejon:entry-plaza
E a-escorial (12,21) -> escorial:entry-plaza
E a-camino (0,14) -> camino:entry-plaza
A entry-camino (2,15)
B entry-abadia (23,2)
C entry-callejon (27,9)
D entry-escorial (13,19)
F anselmo (10,6)
G cirilo (13,6)
I fanatico_pala-1 (8,9)
J fanatico_pala-2 (13,9)
K predicador_pala-1 (6,8)
L nella (23,12)
M odda (24,13)
N minero_cuadrilla-1 (22,14)
O posadera (24,16)
P guardia_abadia (23,4)
Q guardia_baron-1 (25,5)
R market_stall-1 (2,10)
S market_stall-2 (4,10)
T cart_sacks-1 (12,11)
U sacks-1 (13,11)
props: gallows-1, barrel-1, barrel_oil-1, well-1, barrel-2, crate-3, barrel-3
arenas juicio (1,4 16x10) {}
scenes juicio-anselmo (0,8 16x11) {"dialogue":"juicio_anselmo","speaker":"cirilo","once":true,"gate":true,"protects":"a-calles,a-escorial,a-abadia","fight":"fanatico_pala-1,fanatico_pala-2,predicador_pala-1"}
```

### `callejon`

**1-3 · Callejón del Pagaré.** Une la plaza con la calle mayor. A mitad del callejón, en un patio, los cobradores de Lisandro (dos matones y dos ganzúas) le han arrancado la puerta a una viuda. La boca del callejón es un paso de dos casillas; un pasaje trasero por una casa en ruinas permite flanquearlos desde abajo. Un ballestero ocupa el balcón de madera (h2) sobre el patio, con una caída de 2 niveles debajo, y hay un barril de aceite junto a la escalera del balcón.

```
== callejon: Callejón del Pagaré (30x14, ambient 0.4)
ghghghghghghghghghghghghghghgh   ##############################
hghghghghghghghghghghghghghghg   ##############################
ghghghghghghghghghghghghghghgh   ##############################
hghghghghgcyyyFyyycchghghghghg   ##########0122222200##########
ghghghghgh*cccccccccghghghghgh   ##########0000000000##########
hghghghghgcocccccLGchghghghghg   ##########0000000#00##########
EAcccccccccccccCcLcccccccccc*E   00000000000000000#000000000000
E*ccccccccccccccccccwwwwccccBE   000000000000000000000000000000
ghgcchghghccIJcDccccghghgcchgh   ###00#####0000000000#####00###
hghccghghgccccccccxchghghccghg   ###00#####0000000000#####00###
ghgcccKcccccccccccccccccccchgh   ###000000000000000000000000###
hghcccccccccccccccccccLccccghg   ###000000000000000000000000###
ghghghghghghghghghghghghghghgh   ##############################
hghghghghghghghghghghghghghghg   ##############################
E a-plaza (0,6) -> plaza:entry-callejon
E a-calles (29,6) -> calles:entry-callejon
A entry-plaza (1,6)
B entry-calles (28,7)
C cobrador-1 (15,6)
D ganzua-3 (15,8)
F ganzua-1 (14,3)
G ganzua-2 (18,5)
I cart_sacks-1 (12,8)
J sacks-1 (13,8)
K rubble_pile-1 (6,10)
L rubble_pile_b-1 (22,11)
props: crate-1, barrel_oil-1
encounter cobradores: cobrador-1,ganzua-3,ganzua-1,ganzua-2
arenas cobradores (8,2 14x10) {}
```

### `abadia`

**2 · La abadía.** Al norte, la sala capitular con el estrado (h1) donde están el barón y Hilda, los guardias y el tapiz con la sexta ballesta (`tapestry_crossbow-1`). El camino de la plaza solo se abre con `audiencia_concedida`. Al oeste, la cocina con barriles de aceite. Al este, la cripta tras `door-cripta`; su escalera baja a la mina y solo se abre con la llave del barón (D1, defender). Al sur, el claustro con un adarve (h2) sobre la puerta; quien caiga del adarve al paso de la puerta cae 2 niveles. Fuera hay cajas para la barricada de la noche de las antorchas. La zona `audiencia` abre el diálogo de la escena 2.

```
== abadia: La abadía vieja (28x22, ambient 0.35)
W##########################W   ############################
Wo....#=t=====B=======t#..EW   #00000#0000011111100000#000#
Wo....#=========C======#...W   #00000#0000011111100000#000#
W.....#================#.T.W   #00000#0000000000000000#000#
W..*..#=D============F=#.*.W   #00000#0000000000000000#000#
W.....#================#...W   #00000#0000000000000000#000#
W.....#===*========*===#...W   #00000#0000000000000000#000#
W....x#================#...W   #00000#0000000000000000#000#
W##/##########//#########d#W   ###0##########00############
W......*............*......W   #00000000000000000000000000#
W.............N............W   #00000000000000000000000000#
W....sUsKssssssssssssVs....W   #00000000000000000000000000#
W....ssssxsssussssussss....W   #00000000000000000000000000#
W....ssssssRXsOYSssssss....W   #00000000000000000000000000#
W............J.............W   #00000000000000000000000000#
W.===GPL=====..=====MQI===.W   #12222222222200222222222221#
WWWWWWWWWWWWW//WWWWWWWWWWWWW   #############00#############
RRRRRRRRRRRR*RR*RRRRRRRRRRRR   0000000000000000000000000000
RRRRRRRfRRRxRRRRRxRRgRRRRRRR   0000000000000000000000000000
WRRRRRRRZRRRRARmRRkaRRRRRRRW   #00000000000000000000000000#
WWRRRRRRRjdRhRbRReRRRRRRRRWW   ##000000000000000000000000##
WWWWWWWWWWWEEEEEEWWWWWWWWWWW   ###########000000###########
E a-plaza (11,21) -> plaza:entry-abadia
E escalera-cripta (26,1) -> mina:entry-cripta
A entry-plaza (13,19)
B mazo (14,1)
C hilda (16,2)
D guardia_baron-1 (8,4)
F guardia_baron-2 (21,4)
G guardia_baron-3 (5,15)
I capellan_abadia-1 (22,15)
J guardia_baron_sargento-1 (13,14)
K guardia_baron-9 (8,11)
L guardia_baron-10 (7,15)
M guardia_baron-11 (20,15)
N capellan_abadia-2 (14,10)
O guardia_baron_sargento-2 (14,13)
P guardia_baron-5 (6,15)
Q guardia_baron-6 (21,15)
R guardia_baron-7 (11,13)
S guardia_baron-8 (16,13)
T entry-cripta (25,3)
U sacks-1 (6,11)
V sacks-2 (21,11)
X tombstone-1 (12,13)
Y tombstone-2 (15,13)
Z minero_cuadrilla-1 (8,19)
a minero_cuadrilla-2 (19,19)
b minero_cuadrilla-3 (14,20)
d hulla-1 (10,20)
e hulla-2 (17,20)
f minero_cuadrilla-4 (7,18)
g minero_cuadrilla-5 (20,18)
h minero_cuadrilla-6 (12,20)
j hulla-3 (9,20)
k hulla-4 (18,19)
m odda_noche (15,19)
props: tapestry_crossbow-1, tapestry-1, door-cripta, barrel_oil-1, barrel_oil-2, campfire-3, crate-1, crate-2, barrel-2, barrel-1, crate-3, crate-4
encounter d1-asalto: guardia_baron-9,guardia_baron-10,guardia_baron-11,capellan_abadia-2,guardia_baron_sargento-2,minero_cuadrilla-1,minero_cuadrilla-2,minero_cuadrilla-3,hulla-1,hulla-2
encounter d1-defensa: odda_noche,minero_cuadrilla-4,minero_cuadrilla-5,minero_cuadrilla-6,hulla-3,hulla-4,guardia_baron-5,guardia_baron-6,guardia_baron-7,guardia_baron-8
arenas d1-puerta-y-claustro (0,9 28x13) {}
scenes audiencia (12,4 4x3) {"dialogue":"audiencia_abadia","speaker":"mazo","once":true}
```

### `calles`

**3 · Hilos sueltos.** La calle mayor. Al norte, la capilla de la Santa Pala, excavada en una bocamina (nave en h2, sermón de Cirilo), y la casa de las viudas. Benita y Casilda lavan en el Lloro (río con orillas). Al sur, la casa de empeños de Lisandro. El libro de cuentas está en `chest-libro_cuentas`, en la trastienda, y se llega por **dos puertas distintas** (`door-trastienda` desde la tienda y `door-patio_lisandro` desde el patio), con un dardo envenenado en el suelo (detección 14, Juego de manos CD 13). Al este corre el Lloro (agua) y sigue el camino del Escorial. Hay un muelle de carga (h1) y faroles.

```
== calles: Calles de Hondonegra (34x24, ambient 0.45)
ghghghghgWWWWWWWWWWWWhghghghghghgh   ##################################
hghghghghWW.*....*.WWghghghghghghg   ###########22222222###############
ghghghghgWW...C....WWh=====*=hghgh   ###########22222222###0000000#####
hghghghghWW.D....F.WWg=======ghghg   ###########22222222###0000000#####
ghghghghgWW........WWh=======hghgh   ###########22222222###0000000#####
hghghghghWWWWW..WWWWWg=======ghghg   ##############22######0000000#####
ghghghghgWWWWW..WWWWWh==J==*=hghgh   ##############11######0000000#####
hghghghghWWWWW..WWWWWg=======ghghg   ##############00######0000000#####
ghghghghgWWWWW..WWWWWhghg/ghghghgh   ##############00#########0########
Eccccc*ccccccccccccc*ccccccc*ccccE   0000000000000000000000000000000000
EcAccccccccccccccccccccccccccccccE   0000000000000000000000000000000000
EccccccccccxcccccccccccccccccccBcE   0000000000000000000000000000000000
E*cccccccccccccccccxcccucccccccc*E   0000000000000000000000000000000000
ssssssssssssssss===========sbwwbss   0000000000000000111111111110000000
sssWWWWW/WWWWWssgggggggggggsbwwbss   000#####0#####00###########0000000
sssW=========Wssgggggggggggsbwwbss   000#000000000#00###########0000000
sssW===K==*==WssgggggggggggsGww*ss   000#000000000#00###########0000000
sssW=========Wssgggggggggggsbwwbss   000#000000000#00###########0000000
sssWWWWWdWWWWWssgggggggggggsbwwIss   000###########00###########0000000
sssW======^==Wssgggggggggggsbwwbss   000#000000000#00###########0000000
sssW=======c=Wssssssssssssssbwwbss   000#000000000#00000000000000000000
sssWWdWWWWWWWWsssossxxssssssbwwbss   000###########00000000000000000000
ssssss*sssssssfffffssffffffsbwwbss   00000000000000#####00######0000000
ssssssssssssssssssssssssssssbwwbss   0000000000000000000000000000000000
^ dardo-trastienda (10,19) {"marker":"trap_dart","detect":14,"save":"con","dc":13,"damage":"2d4","type":"poison","condition":"poisoned","turns":3,"disarmCheck":"sleight_of_hand","disarmDc":13}
E a-plaza (0,9) -> callejon:entry-calles
E a-escorial (33,9) -> escorial:entry-calles
A entry-callejon (2,10)
B entry-escorial (31,11)
C cirilo (14,2)
D fiel_pala-1 (12,3)
F fiel_pala-2 (17,3)
G benita (28,16)
I casilda (31,18)
J viuda-3 (24,6)
K lisandro (7,16)
props: campfire-5, door-trastienda, door-patio_lisandro, chest-libro_cuentas, crate-1, crate-2, barrel-1, barrel_oil-1, crate-3, crate-4
scenes sermon (13,5 4x3) {"dialogue":"sermon_cirilo","speaker":"cirilo","once":true}
```

### `escorial`

**4 · El Escorial y el Pozo del Ahorcado.** Dos escombreras que suben hasta h3. En la A, un carro de aceite (`oil_cart` y dos barriles) descansa en una cornisa h3 sobre un hombro h1, con aceite pintado hasta el camino: si estallan los barriles, arde el camino. Si empujas a alguien desde la cornisa, cae 2 niveles. El campamento sinpaga tiene una choza, una plataforma de tablones (h1) y un andamio de vigía (h2). Hay dos trampas: un cordel que derrama aceite y un cepo. Al entrar desde el pueblo, una franja de lado a lado abre la parlamentación con el jefe (`sinpaga_jefe`, hablante `sinpaga_enmascarado-1`); si acaba a golpes, pelea toda la facción. Las dos bajadas a la mina (pozo y bocamina) exigen `d1_resuelto`. En el Pozo del Ahorcado está el primer Callado (`callado-1`). La bocamina principal está atrancada (`door-bocamina`).

```
== escorial: El Escorial (36x26, ambient 0.6)
kkkEEEkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   333000333333333333333333333333333333
kS*IIISSSSSSSSSSSSSSSSSSSSSSSSSSSSSk   300000000000000000000000000000000003
kSSIAISSS&&SSSSSSSSSSSSSSSSSSSSSSSSk   300000000111111111100000000000000003
kSSIIISSS&&SSSSSSSSSSSSSSSSSSSSSSSSk   300000000122222222100000000000000003
kSSIIISSS&&SSSSSSSSSSSSSSSSSSSWWWSSk   300000000122333322100000000000###003
kSSIIISSSSSSSFSSSSSSSSSSSSSSSSWOWSSk   300000000122333322100000000000#0#003
kSSIIISSSSSSSSSSSSSSSSSSSSSSSS*ESSSk   300000000122333322100000000000000003
kSSIIISSSSSSSSSSSSSSSSSSSSSSSSSISSSk   300000000122333322100000000000000003
kSSIIISSSSSSxooSSSSSSSSSSSSSSSSCSSSk   300000000122333322100000000000000003
kSSIIISSSSSS%%%%SSSSSSSSSSSSSSSMSSSk   300000000111111111100000000000000003
k*SIIISSSSSS%%%%SSSSSSSSSSSSSSSISSSk   300000000000000000000000000000000003
ERRRRRR^RRRR%%%%RRRRRRRRRRRRRRRRRSSk   000000000000000000000000000000000003
ERBRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRSSk   000000000000000000000000000000000003
ERRRRRRRRRRRRRRRRRRRRR^RRRRQRRRRRSSk   000000000000000000000000000000000003
kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSISSk   300000000000000000000000000000000003
kSSSSSSSSmPmmmmm====mmSSSSSSS&&SISSk   300000000000000011110001111111100003
kSSSSSSSSmgggmmm==K=mmSSSSSSS&&SDSSk   3000000000###00011210001222222100003
kSSSSSSSSmgggmmm====mNSSSSSSS&&*ISSk   3000000000###00011110001233332100003
kSSSwwwSSmgggmmmmmmmmmSSSSGSSSWWdWWk   3000000000###00000000001233332#####3
kSSSwwwSSmmmmmmLmmmmmmSSSSSSSSWW.WWk   300000000000000000000001233332##0##3
kSSSwwwSSmmmImmmmmmmJmSSSSSSSSWW.WWk   300000000000000000000001233332##0##3
kSSSSSSSSummmm*mmmmOmmSSSSSSSSWWEWWk   300000000000000000000001222222##0##3
kSSSSSSSSmmmmmmmmmmmmmSSSSSSSSWWWWWk   300000000000000000000001111111#####3
kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSWWWWWk   300000000000000000000000000000#####3
kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSWWWWWk   300000000000000000000000000000#####3
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   333333333333333333333333333333333333
^ cuerda-aceite (7,11) {"marker":"trap_tripwire","detect":13,"surface":"oil","disarmCheck":"sleight_of_hand","disarmDc":12}
^ cepo-sinpaga (22,13) {"marker":"trap_beartrap","detect":12,"save":"dex","dc":13,"damage":"2d6","type":"piercing","condition":"restrained","disarmCheck":"sleight_of_hand","disarmDc":12}
E a-plaza (3,0) -> plaza:entry-escorial
E a-calles (0,11) -> calles:entry-escorial
E pozo-del-ahorcado (31,6) -> tunel:entry-pozo
E bocamina (32,21) -> mina:entry-bocamina
A entry-plaza (4,2)
B entry-calles (2,12)
C entry-pozo (31,8)
D entry-bocamina (32,16)
F sinpaga_enmascarado-1 (13,5)
G sinpaga_cuchillero-4 (26,18)
I sinpaga_cuchillero-1 (12,20)
J sinpaga_cuchillero-2 (20,20)
K curandero_sinpaga-1 (18,16)
L sinpaga_bruto-1 (15,19)
M callado-1 (31,9)
N cart-1 (21,17)
O ore_pile-1 (19,21)
P ore_pile-2 (10,15)
Q ore_pile-3 (27,13)
props: barrel_oil-1, barrel_oil-2, oil_cart-1, barrel-1, campfire-1, door-bocamina, well-1
arenas escombreras (8,2 23x21) {}
scenes callado-pozo (30,7 3x4) {"dialogue":"callado_pozo","speaker":"callado-1","once":true,"requiresFlag":"escorial_libre"}
scenes sinpaga-jefe (1,1 7x24) {"dialogue":"sinpaga_jefe","speaker":"sinpaga_enmascarado-1","once":true,"gate":true,"protects":"pozo-del-ahorcado,bocamina"}
```

### `tunel`

**4-5 · Túnel de los Callados.** La galería de contrabando de Brea entre el Pozo del Ahorcado y la mina (después de D1). El grupo baja por la cuerda a un rellano (h2) y luego por una rampa. Los Callados acarrean plata por los raíles, y hay ratas entre los escombros. Dos esqueletos de mineros con arco guardan una repisa lateral (h2) con una caída de 2 niveles. Hay aceite de candil junto al entibado y una filtración de agua.

```
== tunel: Túnel de los Callados (32x14, ambient 0.12)
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   ################################
kkkkkkkkkkk...J.....kkkkkkkkkkkk   ###########222222222############
kkkkkkkkkkk.......K.kkkkkkkkkkkk   ###########222222222############
kkEkkkkkkkk.........kkkkkkkkkkkk   ##2########100000000############
k.*..k..*..........F...N.......E   #2222#00000000000000000000000000
k.A..k..........L..............E   #2222#00000000000000000000000000
k..............G......C...*...BE   #2222100000000000000000000000000
k....k-------------x-----x-----E   #2222#00000000000000000000000000
k....k..........I....D......*..E   #2222#00000000000000000000000000
kkkkkk..wwwwwM........o.*......E   ######00000000000000000000000000
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   ################################
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   ################################
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   ################################
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   ################################
E a-escorial (2,3) -> escorial:entry-pozo
E a-mina (31,4) -> mina:entry-pozo
A entry-pozo (2,5)
B entry-mina (30,6)
C callado-14 (22,6)
D callado-12 (21,8)
F callado-13 (19,4)
G rata_gigante-2 (15,6)
I rata_gigante-3 (16,8)
J esqueleto_minero-1 (14,1)
K esqueleto_minero-2 (18,2)
L rubble_pile-2 (16,5)
M rubble_pile_c-2 (13,9)
N pillar_broken-2 (23,4)
props: mine_wagon-3, mine_wagon_ore-2, barrel_oil-1, campfire-2
encounter callados-del-tunel: callado-14,callado-12,callado-13,rata_gigante-2,rata_gigante-3,esqueleto_minero-1,esqueleto_minero-2
arenas tunel (6,1 22x9) {}
```

### `mina`

**5 · La mina.** Tres entradas que acaban en la gran explotación: la bocamina (oeste, raíles), el pozo (que deja al grupo en un nicho h3 sobre la cornisa norte, h2) y la cripta (túnel suroeste, con su propia pareja de Callados y un cable de derrumbe). Dentro hay una cornisa norte que cae 2 niveles al suelo, una torre de andamio (h3), una pasarela este de andamio (h2) cortada donde pasan los raíles, vagonetas, aceite y una filtración de agua. Tras la brecha de escombros está la Galería Sellada: la mecha (`fuse_charges-1`) y los restos de los cuarenta (`remains_forty-1`), la escena de Garrán (D2) y una emboscada en los nichos, condicionada a la marca de D2 (I4). Al fondo se baja a la Bóveda.

```
== mina: La mina (40x30, ambient 0.12)
#####################E##################   #####################3##################
####################.*.#################   ####################333#################
####################.B.#################   ####################333#################
####################...#################   ####################333#################
####################...#################   ####################333#################
##############.#......*.I....H##########   ##############0#22222222222222##########
##############.H.............H##########   ##############0122222222222222##########
##############...............H.#########   ##############00000000000000020#########
##############...............HH##M.#####   ##############00000000000000022##00#####
##############.......##......HH##..#####   ##############0000000##00000022##00#####
##############..HFH..##....Q.^H#..R....#   ##############0033300##00000022#0000000#
##############..H............HH#...f..O#   ##############00200000000000022#0000000#
##############..H*...........HG#.o....*#   ##############00100000000000022#0000110#
E.A.*..................o.......&.......E   0000000000000000000000000000000000001100
E-------x----------x------x----&-u-*.D.E   0000000000000000000000000000000000000000
E............................**&......*E   0000000000000000000000000000000000000000
##############...........#...HH#..k.&&.#   ##############00000000000#00022#0000000#
##############...........#...HH#....&&.#   ##############00000000000#00022#0000000#
##############....P.wwww.....HH#.......#   ##############00000000000000022#0000000#
##############......wwww.....H######..##   ##############0000000000000001######00##
##############......wwww...Jo..#####.N##   ##############00000000000000000#####00##
##############.................#########   ##############00000000000000000#########
###############..#######################   ###############11#######################
###############..#######################   ###############11#######################
###############L.#######################   ###############00#######################
###############*.#######################   ###############00#######################
E..*.....^...K...#######################   00000000000000000#######################
E.C.........o....#######################   00000000000000000#######################
E.....##################################   000000##################################
########################################   ########################################
^ tablon-podrido (29,10) {"marker":"trap_rotten_plank","detect":14,"save":"dex","dc":12,"damage":"2d6","type":"bludgeoning","condition":"prone","disarmCheck":"athletics","disarmDc":12}
^ cable-derrumbe (9,26) {"marker":"trap_tripwire","detect":13,"save":"dex","dc":13,"damage":"2d8","type":"bludgeoning","half":true,"surface":"rubble","disarmCheck":"sleight_of_hand","disarmDc":13}
E a-escorial-bocamina (0,13) -> escorial:entry-bocamina
E a-escorial-pozo (21,0) -> tunel:entry-mina
E a-abadia-cripta (0,26) -> abadia:entry-cripta
E a-boveda (39,13) -> boveda:entry-mina
A entry-bocamina (2,13)
B entry-pozo (21,2)
C entry-cripta (2,27)
D entry-boveda (37,14)
F callado-2 (17,10)
G callado-3 (30,12)
I callado-4 (24,5)
J callado_palido-1 (27,20)
K callado-5 (13,26)
L callado-6 (15,24)
M callado-7 (33,8)
N callado-8 (37,20)
O callado_palido-2 (38,11)
P rubble_pile-1 (18,18)
Q ore_pile-1 (27,10)
R rubble_pile_c-1 (34,10)
props: fuse_charges-1, remains_forty-1, mine_wagon-1, mine_wagon_ore-1, barrel_oil-1, mine_wagon-2, barrel_oil-2, barrel-1, campfire-4, powder_keg-1, barrel_oil-3
encounter callados-andamios: callado-2,callado-3,callado-4,callado_palido-1
encounter callados-cripta: callado-5,callado-6
encounter emboscada-sellada: callado-7,callado-8,callado_palido-2
arenas andamios (14,5 17x17) {}
arenas cripta (6,22 11x6) {}
arenas galeria-sellada (31,8 9x13) {}
scenes galeria-sellada (32,12 3x5) {"dialogue":"galeria_sellada","speaker":"garran","once":true}
```

### `boveda`

**6 · La Bóveda.** Se entra en alto, por un rellano al nivel del suelo de la bóveda (h2). Brea ocupa el balcón norte (h3), separado del suelo por una zanja (h1) y con escaleras solo en los extremos; empujar a alguien del balcón a la zanja lo hace caer 2 niveles. Cuatro resonadores (`resonator-n`, I6) rodean el centro. El polvorín está en una plataforma h3 al sureste (`powder_keg`). La polea (`lever-polea`) está en el balcón. Una sima recorre el sur (h0) con una sola rampa de salida. La capa `collapse` hunde el centro hasta h0 cuando Brea vuela el polvorín y deja un borde h1 para salir del hoyo (el test lo comprueba). `inscription-1` es la talla élfica para la tirada de Historia.

```
== boveda: La Bóveda (32x24, ambient 0.1)
################################   ################################
##########vvvvvvvvvvplvv########   ##########23333333333332########
##########vvv*vvBvvvvvvv########   ##########23333333333332########
##########vvvvvvvvvvvvvv########   ##########23333333333332########
######vvvvvvvvvvvvvvvvvvvv######   ######22222111111111111222######
######vivvvvvvvvvvvvvvvvvv######   ######22222222222222222222######
######vvvDvvvvvvvvvvvvFvvv######   ######22222222222222222222######
######vvvvv*vvvvvvvv*vvvvv######   ######22222222222222222222######
######vJvvvrvvvvvvvvrvvvvv######   ######22222222222222222222######
######vvvvvvvvvvvvvvvvvvvv######   ######22222222222222222222######
######vv#vvvvvCvvvvvvvv#vv######   ######22#22222222222222#22######
Ev*vvvvvvvvvvvvvvvvvvvvvvv######   22222222222222222222222222######
EvAvvvvvvvLvvvvvvvvvvvvvvv######   22222222222222222222222222######
Evvvvvvvvvvvvvvvvvvvvvvvvv######   22222222222222222222222222######
######vv#vvvvvvvvvvvvvv#vv######   ######22#22222222222222#22######
######vvvvvvvvvvvvvvvvvvov######   ######22222222222222223333######
######vKvvvrvvvvvvvvrvvovv######   ######22222222222222223333######
######vvvvv*vvvvvvvv*vvvov######   ######22222222222222223333######
######vvvvvvvvvvvvvvvvvvv*######   ######22222222222222223333######
######vvvvvvvvvvvvvvvvvvvv######   ######22222222222222222222######
########&&&vvvvvvvvvvvv#########   ########000000000000001#########
########&G&Ivvvvvvvvvv##########   ########00000000000000##########
################################   ################################
################################   ################################
E a-mina (0,11) -> mina:entry-boveda
A entry-mina (2,12)
B absalon (16,2)
C ivo (14,10)
D callado-9 (9,6)
F callado-10 (22,6)
G callado-11 (9,21)
I callado_palido-3 (11,21)
J sarcophagus-1 (7,8)
K sarcophagus-2 (7,16)
L pillar_broken-1 (10,12)
props: resonator-1, resonator-2, resonator-3, resonator-4, powder_keg-1, powder_keg-2, powder_keg-3, lever-polea, pulley-1, inscription-1
arenas boveda (3,1 25x21) {}
scenes brea-habla (3,10 4x5) {"dialogue":"boveda_brea","speaker":"absalon","once":true}
collapse derrumbe (13,9 5x6) {"height":0,"terrain":"vault","trigger":"brea_vuela_polvorin"}
collapse derrumbe-borde (18,9 1x6) {"height":1,"terrain":"vault","trigger":"brea_vuela_polvorin"}
```
