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

## Mapas

### `camino`

**P · El camino.** El último tramo del camino al valle, al atardecer. El grupo empieza al oeste con Dorotea, y el camino va elevado (h1). Al sur está la cuneta (h0) donde espera Garrán. Al este, los mineros hambrientos (ids de `cast.json`) cortan el paso junto a un carro volcado: cajas, un barril de aceite y aceite derramado. Hay una hoguera (`campfire`). Un vigía sube a un peñasco de escoria (h3); quien lo empuje por su cara sur lo hace caer 2 niveles. Para el tutorial hay un charco en el camino, una caja que hace de primera cobertura y un cepo de furtivo fácil (detección 10). Dos franjas `scenes` de lado a lado del mapa (`gate`) hacen inevitables a Garrán (`camino_garran`) y a los mineros (`camino_mineros`); el combate se puede evitar hablando. La salida este lleva a la plaza y exige `prologo_mineros_resuelto`.

```
== camino: El camino (32x18, ambient 0.6)
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   33333333333333333333333333333333
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   33333322222233333333332222222333
kkkkkkkssssskkkkkkkkkkksssssskkk   33322221111122222322222111111223
kkksssssssssssssssskkkkksssssssk   32211111111111111112333211111112
kksssssssssssss^ssskkGkksssssssk   32111111111111111112333211111112
kksssssssssssssssskkkkkksssssssk   32111111111111111112333211111112
kksssssssssssssssskkkkkksssssssk   32111111111111111112333211111112
kffffffxsfffffsssssssssssffffffk   31111111111111111111111111111112
kssssssssssssRwwRRRRRRRRRRRRRRRE   21111111111111111111111111111111
RRR@RRRRRRRRRRwwRRRRDRRRRRRRRARE   11111111111111111111111111111111
RRBRRRRRRRRRRsssssssssFsssssssss   11111111111111111111111111111111
sssssmmmmmmmmssssssssssxxosIssss   11111000000001111111111111111111
sssssmmmmCmmmssssssssssss%%sssss   11111000000001111111111111111111
kssssssssssssssssssssssss*ssssss   21111111111111111111111111111111
kksssssssssssssssssssssssssssskk   22111111111111111111111111111122
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   32222222222222222222222222222223
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   33333333333333333333333333333333
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   33333333333333333333333333333333
^ cepo-furtivo (15,4) {"marker":"trap_beartrap","detect":10,"save":"dex","dc":11,"damage":"1d6","type":"piercing","condition":"restrained","disarmCheck":"sleight_of_hand","disarmDc":10}
E a-hondonegra (31,8) -> plaza:entry-camino
@ hero (3,9)
A entry-plaza (29,9)
B dorotea (2,10)
C garran (9,12)
D minero_cabecilla (20,9)
F minero_hambriento_1 (22,10)
G minero_hambriento_2 (21,4)
I minero_hambriento_3 (27,11)
props: crate-1, crate-2, barrel_oil-1, crate-3, campfire-1
scenes garran-en-la-cuneta (6,0 1x18) {"dialogue":"camino_garran","speaker":"garran","once":true,"gate":true,"protects":"a-hondonegra"}
scenes mineros-cortan-el-paso (16,0 2x18) {"dialogue":"camino_mineros","speaker":"minero_cabecilla","once":true,"gate":true,"protects":"a-hondonegra","fight":"minero_cabecilla,minero_hambriento_1,minero_hambriento_2,minero_hambriento_3"}
```

### `plaza`

**1 · La plaza.** La Torre del Cepo con el cadalso, una plataforma h2 con escalones a ambos lados: allí están Anselmo, Cirilo y tres fanáticos de la Santa Pala, y la zona `juicio-anselmo` (tras `plaza_llegada`). El suelo es de barro, con un pozo y la horca como props. Junto al Pico Roto esperan Nella, Odda y un minero; al pie del camino de la abadía, dos guardias. Hay una terraza de mercado (h1) con cajas, aceite de lámpara junto al cadalso y un abrevadero. Cuatro salidas: el camino (oeste), la abadía (norte, con `audiencia_concedida`), las calles (este, con `juicio_resuelto`) y el Escorial (sur, con `audiencia_hecha`). El juicio no puede acabar en pelea contra Cirilo (es esencial).

```
== plaza: La plaza de Hondonegra (30x22, ambient 0.5)
ghghghghghghghghghghghEEEEghgh   ######################3333####
hghghghghghghghghghghgcccchghg   ######################2222####
ghghghghghghghghghghghcBccghgh   ######################2222####
hghghghgWWWWhghghghghgc*cchghg   ######################1111####
gRRRRRRRWWWWRRRRRRRRRRcPccghgh   #0000000####00000000001111####
hRRRRRRRWWWWRRRRRRRRRRRRRQhghg   #0000000####00000000000000####
gRRRRRR==TF==G=RRRRRRRRRRRghgh   #0000001222222100000000000####
hRRRRRR========RRRRRRRRRRRhghg   #0000001222222100000000000####
gRRRRRK*RRRRRRRoRRRRRRRRRRRRRE   #00000000000000000000000000000
hccc*cRRIRRRRJ*RRRRRRRRRRRRCRE   #11111000000000000000000000000
gcxxccRRRRRRRRRRRRRRRRRRRRRRRE   #11111000000000000000000000000
hcucccRRRRRRRRRRRRRRRRRRRghghg   #111110000000000000000000#####
gcccccRRRRRRRRRRROR*RRRLR*ghgh   #111110000000000000000000#####
hRRRRRRRRRRRRRRRRRRuRRRRMghghg   #000000000000000000000000#####
ERRRRRRRRRRRRRRRwwwRRRNRRhghgh   0000000000000000000000000#####
ERARRRRRRRRRRRRRRRRRRRRRR/hghg   00000000000000000000000000####
ERRRRRRRRRRRRRRRRRRRxRRROhghgh   0000000000000000000000000#####
hRRRRRRRRRRRRRRRRRRRRRRRRghghg   #000000000000000000000000#####
gRRRRRRRRRRRRRRRRRRRRRRRRhghgh   #000000000000000000000000#####
hghghghghghgIDIghghghghghghghg   ############000###############
ghghghghghghIIIhghghghghghghgh   ############000###############
hghghghghghgEEEghghghghghghghg   ############000###############
E a-abadia (22,0) -> abadia:entry-plaza
E a-calles (29,8) -> calles:entry-plaza
E a-escorial (12,21) -> escorial:entry-plaza
E a-camino (0,14) -> camino:entry-plaza
A entry-camino (2,15)
B entry-abadia (23,2)
C entry-calles (27,9)
D entry-escorial (13,19)
F anselmo (10,6)
G cirilo (13,6)
I fanatico_pala-1 (8,9)
J fanatico_pala-2 (13,9)
K fanatico_pala-3 (6,8)
L nella (23,12)
M odda (24,13)
N minero_cuadrilla-1 (22,14)
O posadera (24,16)
P guardia_abadia (23,4)
Q guardia_baron-1 (25,5)
props: gallows-1, crate-1, crate-2, barrel-1, barrel_oil-1, well-1, barrel-2, crate-3
scenes noche-antorchas (1,4 25x15) {"dialogue":"noche_antorchas","speaker":"nella","once":true,"requiresFlag":"acceso_contrabando","unlessFlag":"d1_resuelto"}
scenes d1-horca (1,4 25x15) {"dialogue":"d1_horca","speaker":"nella","once":true,"requiresFlag":"d1_cuadrilla"}
scenes juicio-anselmo (0,8 16x11) {"dialogue":"juicio_anselmo","speaker":"cirilo","once":true,"gate":true,"protects":"a-calles,a-escorial,a-abadia","fight":"fanatico_pala-1,fanatico_pala-2,fanatico_pala-3"}
```

### `abadia`

**2 · La abadía.** Al norte, la sala capitular con el estrado (h1) donde están el barón y Hilda, los guardias y el tapiz con la sexta ballesta (`tapestry_crossbow-1`). El camino de la plaza solo se abre con `audiencia_concedida`. Al oeste, la cocina con barriles de aceite. Al este, la cripta tras `door-cripta`; su escalera baja a la mina y solo se abre con la llave del barón (D1, defender). Al sur, el claustro con un adarve (h2) sobre la puerta; quien caiga del adarve al paso de la puerta cae 2 niveles. Fuera hay cajas para la barricada de la noche de las antorchas. La zona `audiencia` abre el diálogo de la escena 2.

```
== abadia: La abadía vieja (28x22, ambient 0.35)
W##########################W   ############################
Wo....#=t=====B=======t#..EW   #00000#0000011111100000#000#
Wo....#=========C======#...W   #00000#0000011111100000#000#
W.....#================#.K.W   #00000#0000000000000000#000#
W.....#=D============F=#.*.W   #00000#0000000000000000#000#
W.....#================#...W   #00000#0000000000000000#000#
W.....#===*========*===#...W   #00000#0000000000000000#000#
W....x#================#...W   #00000#0000000000000000#000#
W##/##########//#########d#W   ###0##########00############
W......*............*......W   #00000000000000000000000000#
W..........................W   #00000000000000000000000000#
W....ssssssssssssssssss....W   #00000000000000000000000000#
W....ssssxssssssssussss....W   #00000000000000000000000000#
W....ssssssssssssssssss....W   #00000000000000000000000000#
W..........................W   #00000000000000000000000000#
W.===G=======..=======I===.W   #12222222222200222222222221#
WWWWWWWWWWWWW//WWWWWWWWWWWWW   #############00#############
RRRRRRRRRRRR*RR*RRRRRRRRRRRR   0000000000000000000000000000
RRRRRRRRRRRxRRRJRxRRRRRRRRRR   0000000000000000000000000000
WRRRRRRRLRRRRARRRRRMRRRRRRRW   #00000000000000000000000000#
WWRRRRRRRRORRQNRRPRRRRRRRRWW   ##000000000000000000000000##
WWWWWWWWWWWEEEEEEWWWWWWWWWWW   ###########000000###########
E a-plaza (11,21) -> plaza:entry-abadia
E escalera-cripta (26,1) -> mina:entry-cripta
A entry-plaza (13,19)
B mazo (14,1)
C hilda (16,2)
D guardia_baron-1 (8,4)
F guardia_baron-2 (21,4)
G guardia_baron-3 (5,15)
I guardia_baron-4 (22,15)
J guardia_baron_sargento-1 (15,18)
K entry-cripta (25,3)
L minero_cuadrilla-1 (8,19)
M minero_cuadrilla-2 (19,19)
N minero_cuadrilla-3 (14,20)
O hulla-1 (10,20)
P hulla-2 (17,20)
Q odda (13,20)
props: tapestry_crossbow-1, tapestry-1, door-cripta, barrel_oil-1, barrel_oil-2, crate-1, crate-2, barrel-1, crate-3, crate-4
encounter d1-asalto: guardia_baron-1,guardia_baron-2,guardia_baron-3,guardia_baron-4,guardia_baron_sargento-1,minero_cuadrilla-1,minero_cuadrilla-2,minero_cuadrilla-3,hulla-1,hulla-2
encounter d1-defensa: odda,minero_cuadrilla-1,minero_cuadrilla-2,minero_cuadrilla-3,hulla-1,hulla-2
scenes d1-abadia-final (7,1 16x7) {"dialogue":"d1_abadia_final","speaker":"mazo","once":true,"requiresFlag":"d1_abadia"}
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
ghghghghgWWWWW..WWWWWh==J====hghgh   ##############11######0000000#####
hghghghghWWWWW..WWWWWg=======ghghg   ##############00######0000000#####
ghghghghgWWWWW..WWWWWhghg/ghghghgh   ##############00#########0########
Eccccc*ccccccccccccc*ccccccc*ccccE   0000000000000000000000000000000000
EcAccccccccccccccccccccccccccccccE   0000000000000000000000000000000000
EccccccccccxcccccccccccccccccccBcE   0000000000000000000000000000000000
EccccccccccccccccccxcccucccccccccE   0000000000000000000000000000000000
ssssssssssssssss===========sbwwbss   0000000000000000111111111110000000
sssWWWWW/WWWWWssgggggggggggsbwwbss   000#####0#####00###########0000000
sssW=========Wssgggggggggggsbwwbss   000#000000000#00###########0000000
sssW===K==*==WssgggggggggggsGwwbss   000#000000000#00###########0000000
sssW=========Wssgggggggggggsbw*bss   000#000000000#00###########0000000
sssWWWWWdWWWWWssgggggggggggsbwwIss   000###########00###########0000000
sssW======^==Wssgggggggggggsbwwbss   000#000000000#00###########0000000
sssW=======c=Wssssssssssssssbwwbss   000#000000000#00000000000000000000
sssWWdWWWWWWWWsssossxxssssssbwwbss   000###########00000000000000000000
ssssss*sssssssfffffssffffffsbwwbss   0000000000000011111001111110000000
ssssssssssssssssssssssssssssbwwbss   0000000000000000000000000000000000
^ dardo-trastienda (10,19) {"marker":"trap_dart","detect":14,"save":"con","dc":13,"damage":"2d4","type":"poison","condition":"poisoned","turns":3,"disarmCheck":"sleight_of_hand","disarmDc":13}
E a-plaza (0,9) -> plaza:entry-calles
E a-escorial (33,9) -> escorial:entry-calles
A entry-plaza (2,10)
B entry-escorial (31,11)
C cirilo (14,2)
D fiel_pala-1 (12,3)
F fiel_pala-2 (17,3)
G benita (28,16)
I casilda (31,18)
J viuda-3 (24,6)
K lisandro (7,16)
props: door-trastienda, door-patio_lisandro, chest-libro_cuentas, crate-1, crate-2, barrel-1, barrel_oil-1, crate-3, crate-4
scenes sermon (13,5 4x3) {"dialogue":"sermon_cirilo","speaker":"cirilo","once":true}
```

### `escorial`

**4 · El Escorial y el Pozo del Ahorcado.** Dos escombreras que suben hasta h3. En la A, un carro de aceite (`oil_cart` y dos barriles) descansa en una cornisa h3 sobre un hombro h1, con aceite pintado hasta el camino: si estallan los barriles, arde el camino. Si empujas a alguien desde la cornisa, cae 2 niveles. El campamento sinpaga tiene una choza, una plataforma de tablones (h1) y un andamio de vigía (h2). Hay dos trampas: un cordel que derrama aceite y un cepo. Al entrar desde el pueblo, una franja de lado a lado abre la parlamentación con el jefe (`sinpaga_jefe`, hablante `sinpaga_enmascarado-1`); si acaba a golpes, pelea toda la facción. Las dos bajadas a la mina (pozo y bocamina) exigen `d1_resuelto`. En el Pozo del Ahorcado está el primer Callado (`callado-1`). La bocamina principal está atrancada (`door-bocamina`).

```
== escorial: El Escorial (36x26, ambient 0.6)
kkkEEEkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   333000333333333333333333333333333333
kSSIIISSSSSSSSSSSSSSSSSSSSSSSSSSSSSk   300000000000000000000000000000000003
kSSIAISSS&&SSSSSSSSSSSSSSSSSSSSSSSSk   300000000111111111100000000000000003
kSSIIISSS&&SSSSSSSSSSSSSSSSSSSSSSSSk   300000000122222222100000000000000003
kSSIIISSS&&SSSSSSSSSSSSSSSSSSSWWWSSk   300000000122333322100000000000###003
kSSIIISSSSSSSFSSSSSSSSSSSSSSSSWOWSSk   300000000122333322100000000000#0#003
kSSIIISSSSSSSSSSSSSSSSSSSSSSSS*ESSSk   300000000122333322100000000000000003
kSSIIISSSSSSSSSSSSSSSSSSSSSSSSSISSSk   300000000122333322100000000000000003
kSSIIISSSSSSxooSSSSSSSSSSSSSSSSCSSSk   300000000122333322100000000000000003
kSSIIISSSSSS%%%%SSSSSSSSSSSSSSSMSSSk   300000000111111111100000000000000003
kSSIIISSSSSS%%%%SSSSSSSSSSSSSSSISSSk   300000000000000000000000000000000003
ERRRRRR^RRRR%%%%RRRRRRRRRRRRRRRRRSSk   000000000000000000000000000000000003
ERBRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRSSk   000000000000000000000000000000000003
ERRRRRRRRRRRRRRRRRRRRR^RRRRRRRRRRSSk   000000000000000000000000000000000003
kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSISSk   300000000000000000000000000000000003
kSSSSSSSSmmmmmmm====mmSSSSSSS&&SISSk   300000000000000011110001111111100003
kSSSSSSSSmgggmmm==K=mmSSSSSSS&&SDSSk   3000000000###00011210001222222100003
kSSSSSSSSmgggmmm====mxSSSSSSS&&*ISSk   3000000000###00011110001233332100003
kSSSwwwSSmgggmmmmmmmmmSSSSGSSSWWdWWk   3000000000###00000000001233332#####3
kSSSwwwSSmmmmmmLmmmmmmSSSSSSSSWW.WWk   300000000000000000000001233332##0##3
kSSSwwwSSmmmImmmmmmmJmSSSSSSSSWW.WWk   300000000000000000000001233332##0##3
kSSSSSSSSummmm*mmmmmmmSSSSSSSSWWEWWk   300000000000000000000001222222##0##3
kSSSSSSSSmmmmmmmmmmmmmSSSSSSSSWWWWWk   300000000000000000000001111111#####3
kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSWWWWWk   300000000000000000000000000000#####3
kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSWWWWWk   300000000000000000000000000000#####3
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk   333333333333333333333333333333333333
^ cuerda-aceite (7,11) {"marker":"trap_tripwire","detect":13,"surface":"oil","disarmCheck":"sleight_of_hand","disarmDc":12}
^ cepo-sinpaga (22,13) {"marker":"trap_beartrap","detect":12,"save":"dex","dc":13,"damage":"2d6","type":"piercing","condition":"restrained","disarmCheck":"sleight_of_hand","disarmDc":12}
E a-plaza (3,0) -> plaza:entry-escorial
E a-calles (0,11) -> calles:entry-escorial
E pozo-del-ahorcado (31,6) -> mina:entry-pozo
E bocamina (32,21) -> mina:entry-bocamina
A entry-plaza (4,2)
B entry-calles (2,12)
C entry-pozo (31,8)
D entry-bocamina (32,16)
F sinpaga_enmascarado-1 (13,5)
G sinpaga_enmascarado-2 (26,18)
I sinpaga_cuchillero-1 (12,20)
J sinpaga_cuchillero-2 (20,20)
K sinpaga_cuchillero-3 (18,16)
L sinpaga_bruto-1 (15,19)
M callado-1 (31,9)
props: barrel_oil-1, barrel_oil-2, oil_cart-1, crate-3, barrel-1, campfire-1, door-bocamina, well-1
scenes callado-pozo (30,7 3x4) {"dialogue":"callado_pozo","speaker":"callado-1","once":true}
scenes sinpaga-jefe (1,1 7x24) {"dialogue":"sinpaga_jefe","speaker":"sinpaga_enmascarado-1","once":true,"gate":true,"protects":"pozo-del-ahorcado,bocamina"}
```

### `mina`

**5 · La mina.** Tres entradas que acaban en la gran explotación: la bocamina (oeste, raíles), el pozo (que deja al grupo en un nicho h3 sobre la cornisa norte, h2) y la cripta (túnel suroeste, con su propia pareja de Callados y un cable de derrumbe). Dentro hay una cornisa norte que cae 2 niveles al suelo, una torre de andamio (h3), una pasarela este de andamio (h2) cortada donde pasan los raíles, vagonetas, aceite y una filtración de agua. Tras la brecha de escombros está la Galería Sellada: la mecha (`fuse_charges-1`) y los restos de los cuarenta (`remains_forty-1`), la escena de Garrán (D2) y una emboscada en los nichos, condicionada a la marca de D2 (I4). Al fondo se baja a la Bóveda.

```
== mina: La mina (40x30, ambient 0.12)
#####################E##################   #####################3##################
####################...#################   ####################333#################
####################.B.#################   ####################333#################
####################...#################   ####################333#################
####################...#################   ####################333#################
##############.#......*.I....H##########   ##############0#22222222222222##########
##############.H.............H##########   ##############0122222222222222##########
##############...............H.#########   ##############00000000000000020#########
##############...............HH##M.#####   ##############00000000000000022##00#####
##############.......##......HH##..#####   ##############0000000##00000022##00#####
##############..HFH..##......^H#.......#   ##############0033300##00000022#0000000#
##############..H............HH#...f..O#   ##############00200000000000022#0000000#
##############..H*...........HG#.......#   ##############00100000000000022#0000000#
E.A.*..................o.......&.......E   0000000000000000000000000000000000000000
E-------x----------x------x----&-u-*.D.E   0000000000000000000000000000000000000000
E............................**&.......E   0000000000000000000000000000000000000000
##############...........#...HH#..k.&&.#   ##############00000000000#00022#0000000#
##############...........#...HH#....&&.#   ##############00000000000#00022#0000000#
##############......wwww.....HH#.......#   ##############00000000000000022#0000000#
##############......wwww.....H######..##   ##############0000000000000001######00##
##############......wwww...Jo..#####.N##   ##############00000000000000000#####00##
##############.................#########   ##############00000000000000000#########
###############..#######################   ###############00#######################
###############..#######################   ###############00#######################
###############L.#######################   ###############00#######################
###############*.#######################   ###############00#######################
E..*.....^...K...#######################   00000000000000000#######################
E.C..............#######################   00000000000000000#######################
E.....##################################   000000##################################
########################################   ########################################
^ tablon-podrido (29,10) {"marker":"trap_rotten_plank","detect":14,"save":"dex","dc":12,"damage":"2d6","type":"bludgeoning","condition":"prone","disarmCheck":"athletics","disarmDc":12}
^ cable-derrumbe (9,26) {"marker":"trap_tripwire","detect":13,"save":"dex","dc":13,"damage":"2d8","type":"bludgeoning","half":true,"surface":"rubble","disarmCheck":"sleight_of_hand","disarmDc":13}
E a-escorial-bocamina (0,13) -> escorial:entry-bocamina
E a-escorial-pozo (21,0) -> escorial:entry-pozo
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
props: fuse_charges-1, remains_forty-1, mine_wagon-1, mine_wagon_ore-1, barrel_oil-1, mine_wagon-2, barrel_oil-2, barrel-1
encounter callados-andamios: callado-2,callado-3,callado-4,callado_palido-1
encounter callados-cripta: callado-5,callado-6
encounter emboscada-sellada: callado-7,callado-8,callado_palido-2
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
######vvvvvrvvvvvvvvrvvvvv######   ######22222222222222222222######
######vvvvvvvvvvvvvvvvvvvv######   ######22222222222222222222######
######vv#vvvvvCvvvvvvvv#vv######   ######22#22222222222222#22######
Evvvvvvvvvvvvvvvvvvvvvvvvv######   22222222222222222222222222######
EvAvvvvvvvvvvvvvvvvIvvvvvv######   22222222222222222222222222######
Evvvvvvvvvvvvvvvvvvvvvvvvv######   22222222222222222222222222######
######vv#vvvvvvvvvvvvvv#vv######   ######22#22222222222222#22######
######vvvvvvvvvvvvvvvvvvov######   ######22222222222222223333######
######vvvvvrvvvvvvvvrvvovv######   ######22222222222222223333######
######vvvvv*vvvvvvvv*vvvov######   ######22222222222222223333######
######vvvvGvvvvvvvvvvvvvv*######   ######22222222222222223333######
######vvvvvvvvvvvvvvvvvvvv######   ######22222222222222222222######
########&&&vvvvvvvvvvvv#########   ########000000000000001#########
########&&&vvvvvvvvvvv##########   ########00000000000000##########
################################   ################################
################################   ################################
E a-mina (0,11) -> mina:entry-boveda
A entry-mina (2,12)
B absalon (16,2)
C ivo (14,10)
D callado-9 (9,6)
F callado-10 (22,6)
G callado-11 (10,18)
I callado_palido-3 (19,12)
props: resonator-1, resonator-2, resonator-3, resonator-4, powder_keg-1, powder_keg-2, powder_keg-3, lever-polea, pulley-1, inscription-1
encounter brea: absalon,ivo,callado-9,callado-10,callado-11,callado_palido-3
scenes brea-habla (3,10 4x5) {"dialogue":"boveda_brea","speaker":"absalon","once":true}
collapse derrumbe (13,9 5x6) {"height":0,"terrain":"vault","trigger":"brea_vuela_polvorin"}
collapse derrumbe-borde (18,9 1x6) {"height":1,"terrain":"vault","trigger":"brea_vuela_polvorin"}
```
