# Peticiones al motor desde el guion de Intereses

El guionista no toca `engine/`, `rulesets/` ni `src/`. Aquí se apunta lo que haría falta y cómo se ha resuelto mientras tanto.

## G1. Saltos condicionales entre nodos

**Qué:** que un nodo pueda continuar a un sitio distinto según una condición, sin que el jugador elija nada. Por ejemplo, `next` como lista `[{ "when": {...}, "next": "a" }, { "next": "b" }]`, o un `when` en el propio nodo para saltárselo.

**Para qué:** hay frases que solo tienen sentido si alguien está en el grupo (Garrán en la audiencia o en el camino), o que cambian con decisiones anteriores. El epílogo, con viñetas que dependen de D1–D4, lo necesita de verdad.

**Mientras tanto:**
- Se duplican las opciones con `when` contrarios (por ejemplo, Intimidación con o sin Garrán) y cada una lleva a su propia variante del nodo.
- Se ordenan las escenas para que la condición se cumpla siempre. La abadía solo abre tras el juicio, así que Anselmo siempre está en la audiencia.
- En las escenas narradas, el jugador elige la variante en una opción condicionada («[Garrán] …»), y siempre queda una salida sin condición.

## G2. Ganchos al terminar un combate iniciado desde un diálogo

**Qué:** un `onVictory` / `onDefeat` (efectos o un diálogo) en `startCombat`.

**Para qué:** al ganar contra los mineros del camino hay que poner `prologo_mineros_resuelto`. Lo mismo pasa con los fanáticos y, más adelante, con los Sinpaga y los Callados.

**Mientras tanto:** las marcas que dependen del resultado llevan `setBy` en `flags.json` y las pone el script de la escena.

## G3. Comprobar si una entidad está en el grupo

**Qué:** una condición `{ "inParty": "garran" }` (genérica: controlador y facción del jugador).

**Mientras tanto:** se usan las marcas `garran_reclutado` y `anselmo_reclutado`. Si un compañero se va (D2, D4), el diálogo que lo eche tiene que borrar su marca.
