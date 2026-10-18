# Propuesta: más combates en el acto de *Intereses*

> Agente de mapas, 2026-10-18. **Aprobada por el usuario** (combate tutorial y subida por experiencia). Lo montado está en [`ENCOUNTERS.md`](ENCOUNTERS.md): el tutorial, el barranco, el callejón y el túnel. Los demás combates opcionales de la tabla quedan como ideas.
>
> Problema (prueba del usuario): se habla demasiado y se pelea poco. Propuesta: un combate tutorial al empezar el camino y combates opcionales o de relleno en cada mapa. Con eso tiene sentido subir de nivel por experiencia en vez de por escenas (lo decide el usuario).

## Principios

- **Opcionales casi siempre.** Al jugador que quiera historia, ningún combate nuevo le cierra el paso. Los que están en el camino se pueden evitar dando un rodeo, pagando o hablando, como los ya existentes.
- **Con sentido en la historia.** Los Sinpaga, los Callados y la gente del banco ya existen; los perros y los cobradores encajan en un pueblo arruinado. Cada combate deja algo: una pista, dinero, un objeto o reputación.
- **Usan el entorno.** Hay al menos un recurso de terreno por combate: altura, un barril, aceite, agua o un empujón hacia un desnivel.
- **Experiencia orientativa** (5e, grupo de 4): un combate fácil sale por unos 75 PX por personaje a nivel 3. Con unos 10 combates nuevos repartidos se alcanzan los niveles 4, 5 y 6 en el mismo orden que la historia.

## Tutorial al principio del camino

**«Ratas del arcén»** (nivel 3; Dorotea y el protagonista, antes de Garrán).
- **Dónde:** en el tramo oeste del camino, entre la salida (x 2-5) y la cuneta (x 6). Los compañeros llegarían por la propia cuneta.
- **Quiénes:** dos ratas gigantes y un perro famélico (bestias de CR 1/8; harían falta en `monsters.json`, o bien reutilizar `commoner` como «carroñero»).
- **Qué enseña, por orden:**
  1. moverse;
  2. atacar;
  3. la altura del camino (h1) sobre la cuneta (h0), con ventaja al atacar desde arriba;
  4. la caja (`crate-3`) como cobertura.
- **Cómo:** con la zona de escena actual de Garrán convertida en «primero las ratas». El texto del tutorial vive en `tutorial.json` (ver `DESIGN.md`).
- **Experiencia:** muy baja, lo justo para enseñar la barra de PX si se adopta.

## Por mapa

| Mapa | Combate | Encaje en la historia | Tipo | Entorno | Nivel |
|---|---|---|---|---|---|
| camino | Ratas del arcén (tutorial) | Ver arriba | Obligatorio y muy fácil | Altura de la cuneta, caja | 3 |
| camino | **Perros asilvestrados** en el peñasco norte (x 19-23, y 3-6) | Los perros de las casas abandonadas | Opcional (al subir al peñasco) | Altura h3, caída de 2 niveles | 3 |
| plaza | **Cobradores de Lisandro** (2-3 matones) en el callejón sur, junto a la salida al Escorial | Lisandro presiona a una viuda; ayudarla cuesta un combate o dinero | Opcional, escena con `fight` | Abrevadero (agua y rayo), cajas del mercado | 3 |
| calles | **Ladrones en el patio** de la casa de empeños (2 bandidos) | Alguien más quiere el libro de cuentas | Opcional (de noche o al forzar la puerta trasera) | Valla baja (h1), barril de aceite del patio | 3-4 |
| calles | **Fieles exaltados** (3) tras el sermón, si Cirilo se ofende | Gancho con `cirilo_ofendido` | Condicional | Escalones de la capilla (h2) | 3-4 |
| escorial | **Perros de los Sinpaga** (2-3), en la ladera norte de la escombrera A | Vigilan el rodeo que evita la parlamentación | Opcional (castiga el rodeo, no la charla) | Escombros (terreno difícil), altura | 4 |
| escorial | **Un Callado solitario** en el pozo, si se le ataca | Ya existe (`callado_pozo`) | Opcional | Pozo, carril estrecho | 4 |
| abadía | **Guardias en la cocina** (2), si te cuelas de noche antes de D1 | Infiltración opcional para ver a Hilda | Opcional | Barriles de aceite de la cocina | 4 |
| mina | **Ratas de mina y un ogro de carga** en la bocamina | Lo que queda de los mineros que no volvieron | En el camino de la bocamina | Vagonetas y raíles | 5 |
| mina | **Esqueletos mineros** (`esqueleto_minero`, ya hay plantilla) en el túnel de la cripta | Los muertos del primer derrumbe | En la ruta de la cripta | Cable de derrumbe | 5 |
| boveda | (nada nuevo) | El jefe basta | — | — | 6 |

## Lo que haría falta si se aprueba

1. **Bestias en el bestiario** (`rulesets/dnd5e/data/monsters.json`): `giant_rat`, `mastiff`, `wolf`, según el SRD.
2. **Plantillas:** `rata`, `perro`, `cobrador` (matón con otra paleta) y `ladron`.
3. **Escenas o zonas en los mapas**, con las condiciones del guion (`requiresFlag`/`unlessFlag`) para las condicionales.
4. **PX** (si se adopta la experiencia): `xp` ya está en cada monstruo. Falta que el ruleset reparta PX al ganar y que el cliente lo muestre. Es trabajo de la sesión principal.

## Equilibrio

Las simulaciones de equilibrio (`scratchpad/mapas/sim.ts`: motor real e IA a ambos lados) sirven también para estos combates. Objetivo: entre el 90 y el 98 % de victorias con 0-1 caídas en los opcionales.
