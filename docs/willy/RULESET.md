# Ruleset `willy`: el Reglamento del Concurso

> Estado: **propuesta pendiente de aprobación** (Fase 0 de *Willy*, 2026-10-17).
> Razas y clases completas en `content/willy/data/races.json` y `classes.json`. Objetos en `items.json`.

## Objetivos

1. **Números a la vista.** Todo lo que importa se ve: atributos, daño, % de acierto, nivel de cada habilidad. Es un LitRPG: los números son parte de la gracia.
2. **Subir de nivel a menudo.** El primer nivel llega en los primeros 5 minutos; luego, unos dos por planta.
3. **Habilidades que mejoran con el uso.** Usar algo lo hace mejor, y el juego lo celebra.
4. **Que lo entienda alguien que nunca ha jugado a rol.** Una sola regla para casi todo: **d20 + atributo contra un número**.
5. **Distinto de 5e.** Sin ventaja/desventaja, sin modificadores de atributo, sin espacios de conjuro, sin ataques de oportunidad por defecto.

## Por qué un ruleset propio y no `extendRuleset(dnd5e)`

- 5e esconde los números detrás de modificadores (un 14 da +2) y de la ventaja; aquí queremos que el número que ves sea el que sumas.
- La progresión de 5e (niveles lentos, conjuros por descanso) no encaja con un roguelite de plantas cortas.
- Lo que sí se reutiliza: la convención d20 de `rulesets/common/d20.ts` (tirar un d20 y sumar), si su API lo permite sin arrastrar la ventaja.
- El ruleset implementa la interfaz `Ruleset` de `engine/ruleset.ts` y no necesita nada de `rulesets/dnd5e/`.

## La regla única

> **Tira un d20, suma el atributo (y los bonos que veas en pantalla). Si igualas o superas el número objetivo, lo consigues.**

| Situación | Tirada | Contra |
|---|---|---|
| Atacar cuerpo a cuerpo | d20 + FUE | Defensa del objetivo |
| Atacar a distancia | d20 + AGI | Defensa del objetivo |
| Prueba (trepar, forzar, convencer…) | d20 + atributo | Dificultad (DIF) |
| Resistir algo (veneno, miedo, empujón) | d20 + atributo | DIF del efecto |

- **20 natural: ¡CRÍTICO!** Daño doble, el Narrador grita y el público se anima.
- **1 natural: pifia.** Fallas, y pasa algo ligeramente ridículo (tabla de pifias en `DESIGN.md`). Al público también le gusta.
- **Antes de tirar se muestra el %**, calculado sin consumir el RNG (vista previa de `DESIGN.md` del motor, Fase 2).

### Dificultades

| DIF | Nombre | Con atributo 6 |
|---|---|---|
| 10 | Trivial | 85 % |
| 13 | Fácil | 70 % |
| 16 | Normal | 55 % |
| 20 | Difícil | 35 % |
| 25 | Heroica | 10 % |

### Bonos situacionales (siempre números fijos y visibles)

| Situación | Bono |
|---|---|
| Atacar desde más altura | +2 por nivel de diferencia (máx. +4) |
| Flanquear (un aliado al otro lado del objetivo) | +2 |
| Objetivo Tumbado | +3 cuerpo a cuerpo, −2 a distancia |
| Objetivo a oscuras (luz < 0,25) | −2 |
| Cobertura parcial / total | −2 / −5 |
| Bajo un foco (Planta 5) | +2 a atacar **y** +2 a que te ataquen |

## Atributos

Seis, con valores visibles que empiezan entre 3 y 9 y llegan a 15-20 al final del juego.

| Id | Nombre | Para qué sirve |
|---|---|---|
| `fue` | **Fuerza** | Atacar cuerpo a cuerpo, daño cuerpo a cuerpo, empujar, resistir empujones |
| `agi` | **Agilidad** | Atacar a distancia, Defensa, movimiento, iniciativa, no resbalar |
| `man` | **Maña** | Energía máxima, trampas, cerraduras, potencia de las habilidades técnicas |
| `agu` | **Aguante** | Vida, resistir veneno, fuego y frío |
| `car` | **Carisma** | Audiencia ganada, afinidad con los patrocinadores, precios, diálogos |
| `sue` | **Suerte** | Pruebas de suerte (tómbola), probabilidad de pifia enemiga, botín de enemigos |

**Valores de partida:** 5 en todo, más los de la raza y la clase, más **3 puntos libres** al crear el personaje (o «Que elija el Narrador», que reparte por ti).

### Valores derivados

| Derivado | Fórmula | Willy típico a nivel 1 |
|---|---|---|
| Vida máxima (PV) | 10 + 2 × AGU + 3 × (nivel − 1) + bonos | 24 |
| Defensa (DEF) | 10 + ⌊AGI / 2⌋ + armadura | 13 |
| Movimiento | 4 + ⌊AGI / 4⌋ casillas | 5 |
| Energía máxima | 3 + ⌊MAÑ / 3⌋ | 5 |
| Bono de daño | ⌊FUE / 3⌋ cuerpo a cuerpo, ⌊AGI / 3⌋ a distancia | +2 |
| Iniciativa | d20 + AGI | — |

## Recursos (registrados en el motor)

| Id | Nombre | Recarga (`ResourceDef.refresh`) | Barra | Notas |
|---|---|---|---|---|
| `vida` | Vida | `longRest` (descanso en el Bar Paco) | Sí | Subir de nivel recupera el 25 % |
| `energia` | Energía | `shortRest` (al acabar cada combate) | Sí | Las habilidades cuestan 1-3. Subir de nivel la llena |
| `acciones` | Acciones | `turn` (2 por turno) | No (puntos) | Atacar, usar objeto o habilidad: 1-2 |
| `movimiento` | Movimiento | `turn` | No | Casillas por turno; «Correr» gasta 1 acción por otro tanto |
| `fichas` | Fichas | `never` | Sí (contador) | Moneda del concurso. Máximo 99 999 |

- **El «descanso corto» es el final de cada combate** (el ruleset lo dispara al recibir `combatEnded`). El «largo», descansar en el Camerino.
- La **audiencia**, la **afinidad de patrocinadores** y el **reloj de planta** no son recursos de entidad: son sistemas del estado (ver `DESIGN.md` y `ENGINE_REQUESTS.md`).
- **XP y nivel** son stats (`xp`, `nivel`), no recursos: no se gastan.

## Combate

- **Iniciativa individual:** d20 + AGI al empezar el combate; empates a favor de Willy.
- **Turno:** 2 acciones + el movimiento. Mover se puede partir antes y después de actuar.
- **Sin ataques de oportunidad** por defecto: moverse junto a un enemigo es libre. Algunos enemigos tienen el rasgo **Guardia** y sí golpean al que se aleja (se marca con un escudo sobre su cabeza). Así el empujón y el reposicionamiento, que es lo que da espectáculo, son baratos.
- **Daño:** dados del arma + bono de daño. Se muestra el rango antes de atacar («4-9»).

### Acciones básicas (todo el mundo)

| Acción | Coste | Efecto |
|---|---|---|
| Atacar | 1 | Con el arma equipada |
| **Empujar** | 1 | d20 + FUE contra DIF 8 + FUE del objetivo. Si acierta, lo mueve 1 casilla. Los grandes (`size:grande`) necesitan habilidad o +5 |
| Lanzar objeto | 1 | Alcance 4. Lo que haga el objeto (frascos, bombonas, un pez) |
| Usar objeto | 1 | Consumibles. Algunos son gratis (café) |
| Correr | 1 | Otro movimiento completo |
| Esperar | 0 | Acaba el turno. **Al público no le gusta.** |
| Hacer el ganso | 1 | Baile, pose o burla. Nada útil, +audiencia pequeña (con rendimiento decreciente) |

### Empujones, choques y caídas

El público premia matar con el entorno, así que estas reglas son generosas y claras:

| Resultado de un empujón | Efecto |
|---|---|
| Choca con un muro u objeto sólido | 1d6 de golpe |
| Choca con otra criatura | 1d4 a las dos y la segunda también puede moverse si es más pequeña («¡Strike!») |
| Cae un desnivel | Ver caídas |
| Cae a un foso o al vacío | **Fuera de plano:** enemigo normal eliminado al instante. Los jefes no caen (anclados) y reciben el 20 % de su vida |
| Entra en una superficie | Sufre su efecto al momento |

**Caídas:** bajar 1 nivel no hace daño; 2 niveles, 1d6; cada nivel extra, +1d6. Quien cae queda **Tumbado**.

### Superficies (motor, Fase 3; datos del ruleset)

| Superficie | Al entrar o empezar el turno dentro | Reacciona con |
|---|---|---|
| Agua | Empapado | Rayo → electrificada; frío → hielo; fuego → vapor |
| Aceite | Prueba AGI DIF 13 o Tumbado | Fuego → llamas grandes (3 turnos) |
| Fuego | Ardiendo | Agua → vapor; se apaga solo en 3 turnos |
| Hielo | Te deslizas 1 casilla más en la dirección en que ibas | Fuego → agua |
| Vapor | Tapa la línea de visión | Frío → agua; se disipa en 2 turnos |
| Tóxico | Envenenado | Fuego → nube tóxica que arde |
| Electrificada | Electrocutado | Se apaga en 1 turno |
| Canicas | Prueba AGI DIF 13 o Tumbado | — |
| Red | Enredado | Fuego → desaparece |
| Cinta (Planta 2) | Te mueve 1 casilla al final de cada ronda | — (es terreno, no superficie) |

### Condiciones

| Id | Nombre | Efecto |
|---|---|---|
| `ardiendo` | Ardiendo | 1d4 de fuego al empezar el turno. Agua lo apaga |
| `empapado` | Empapado | Rayo hace el doble; inmune a Ardiendo; con frío, Congelado |
| `congelado` | Congelado | No puede moverse; recibe +2 de daño de golpe |
| `electrocutado` | Electrocutado | Pierde 1 acción el próximo turno |
| `envenenado` | Envenenado | 1 de daño por turno durante 3 turnos |
| `tumbado` | Tumbado | Levantarse cuesta la mitad del movimiento; +3 a que le peguen cuerpo a cuerpo |
| `aturdido` | Aturdido | Pierde el turno |
| `asustado` | Asustado | Debe alejarse de quien le asustó; no puede acercarse |
| `cegado` | Cegado | −5 a atacar |
| `enredado` | Enredado | No puede moverse hasta superar FUE DIF 13 (1 acción) |
| `bailando` | Bailando | Se mueve 1 casilla al azar al empezar su turno (¡incluso a un foso!) |
| `mareado` | Mareado | −2 a todo |
| `escondido` | Escondido | Los enemigos no le eligen como objetivo; se pierde al atacar |
| `animado` | Animado | +1 al daño |
| `dormido` | Dormido | Pierde el turno; se despierta si recibe daño |
| `petrificado` | Petrificado | No actúa ni recibe daño |
| `afortunado` | Afortunado | La próxima tirada: 2d20 y te quedas el mejor (solo objetos y ventajas raras) |

## Progresión

### Experiencia y niveles

| Fuente de XP | Cantidad |
|---|---|
| Enemigo normal / élite / jefe | 10-20 / 40 / 150 |
| Matar con el entorno (caída, superficie, fuera de plano) | +50 % de la XP del enemigo |
| Primera vez que haces algo nuevo (primer empujón, primer crítico…) | 15 |
| Logro desbloqueado | 25-100 |
| Planta superada | 100 × número de planta |
| Hito de audiencia | 30 |

| Nivel | XP total | Cuándo debería llegar |
|---|---|---|
| 2 | 60 | Primer combate de la Planta 1 |
| 3 | 160 | Mitad de la Planta 1 |
| 4 | 320 | Jefe de la Planta 1 |
| 5 | 550 | Mitad de la Planta 2 |
| 6 | 850 | Final de la Planta 2 |
| 7 | 1 250 | Mitad de la Planta 3 |
| 8 | 1 750 | Final de la Planta 3 |
| 9 | 2 350 | Mitad de la Planta 4 |
| 10 | 3 050 | Final de la Planta 4 |
| 11 | 3 900 | Mitad de la Planta 5 |
| 12 | 4 900 | Jefe final (tope) |

### Qué da cada nivel

- **Siempre:** +3 de vida máxima, **+2 puntos de atributo** (o «Que elija el Narrador»), recuperas el 25 % de la vida y toda la energía. Pantalla «¡SUBES DE NIVEL!» con números grandes, sonido y frase del Narrador.
- **Niveles pares:** eliges **1 de 3 ventajas** (perks) sacadas del mazo de tu raza, tu clase y uno general, con el RNG de la partida.
- **Niveles 3, 6 y 9:** nueva habilidad de clase.
- La **burocracia del orco** le cuesta 30 segundos de reloj por nivel (ver razas).

### Habilidades que suben con el uso

Cada habilidad activa (y algunas pasivas) tiene **nivel de habilidad 1-5**, independiente del nivel del personaje.

| Nivel de habilidad | Usos con efecto acumulados | Qué gana |
|---|---|---|
| 1 | 0 | Base |
| 2 | 4 | +números (daño, alcance o duración) |
| 3 | 12 | **Añadido** (un efecto extra que cambia cómo se usa) |
| 4 | 25 | +números |
| 5 | 45 | **Maestría** (efecto vistoso; el Narrador lo anuncia) |

- «Uso con efecto» significa que hizo algo: un Empujón que movió a alguien, un Lanzar que acertó. Spamear contra la pared no cuenta.
- Las **básicas** también suben: **Empujar** (nivel 3: empuja 2 casillas; 5: empuja en línea a dos enemigos), **Lanzar** (3: alcance +2; 5: rebota a un segundo objetivo), **Esquivar** (pasiva, sube cuando un enemigo falla: +1 DEF por nivel), **Trepar** (3: subir 2 niveles; 5: sin coste extra) y **Comer en combate** (3: comer es gratis una vez por turno; 5: la comida cura el doble). Datos en `classes.json` → `habilidadesBasicas`.
- Los niveles de habilidad viven en la entidad como stats con espacio de nombres: `skill:empujar` (nivel) y `skillxp:empujar` (usos).

## Dificultad

`GameState.settings.difficulty` (propuesta del `DESIGN.md` general):

| Modo | Para quién | Qué cambia |
|---|---|---|
| **Turista** | Quien no ha jugado nunca o quiere la historia | Reloj ×1,5; vida ×1,5; los enemigos hacen −25 % de daño; si caes, vuelves al inicio de la planta con el botín que llevabas |
| **Concursante** (normal) | Por defecto | Números de este documento |
| **Prime time** | Quien quiere sufrir | Reloj ×0,8; enemigos +25 % de vida; patrocinadores más exigentes; audiencia ×1,25 |

## Esbozo de implementación

Solo documentado: no se crea `rulesets/willy/` hasta que la Fase 2 del motor fije los ganchos de combate (`rollInitiative`, `onTurnStart`, `preview`, `listActions`), para no romper la compilación al integrar.

```ts
// rulesets/willy/index.ts (borrador, NO creado todavía)
export const willy: Ruleset = {
  id: 'willy',
  version: 1,
  stats: {
    fue: { label: 'Fuerza' }, agi: { label: 'Agilidad' }, man: { label: 'Maña' },
    agu: { label: 'Aguante' }, car: { label: 'Carisma' }, sue: { label: 'Suerte' },
    nivel: { label: 'Nivel' }, xp: { label: 'Experiencia' }, armadura: { label: 'Armadura' },
    // skill:<id> y skillxp:<id> se declaran dinámicamente desde classes.json
  },
  resources: {
    vida: { label: 'Vida', refresh: 'longRest', visible: true },
    energia: { label: 'Energía', refresh: 'shortRest', visible: true },
    acciones: { label: 'Acciones', refresh: 'turn' },
    movimiento: { label: 'Movimiento', refresh: 'turn' },
    fichas: { label: 'Fichas', refresh: 'never', visible: true },
  },
  conditions: { /* tabla de condiciones de arriba */ },
  movement: { maxStep: 1, climbCost: 1 },
  movementBudget: (e) => 4 + Math.floor(stat(e, 'agi') / 4),
  resolveCheck: (state, req, rng) => {
    const actor = state.entities[req.actorId]!;
    const attr = CHECK_ATTRIBUTE[req.check];          // 'trepar' -> 'agi', 'forzar' -> 'man'...
    const d = rng.die(20);
    const mods = [{ label: ATTR_LABEL[attr], value: stat(actor, attr) }, ...situational(req)];
    const total = d + mods.reduce((s, m) => s + m.value, 0);
    return {
      check: req.check, label: CHECK_LABEL[req.check],
      dice: [{ sides: 20, rolls: [d], kept: [d] }],
      modifiers: mods, total, target: req.target, targetLabel: 'DIF',
      success: d === 20 || (d !== 1 && total >= req.target),
      outcome: d === 20 ? 'critical_success' : d === 1 ? 'fumble' : undefined,
    };
  },
  difficulty: (state, id, source) => 10 + Math.floor(stat(state.entities[id]!, SOURCE_ATTR[source]) / 2),
  dialogueConditions: { race: …, class: …, attributeAtLeast: …, skillAtLeast: …, sponsorLikes: … },
  commands: { attack, shove, throwItem, useItem, useSkill, dash, wait, showOff, openBox },
};
```

Tests previstos: tabla de %, críticos y pifias, empujones contra muro/criatura/vacío, caídas por niveles, subida de nivel de habilidad exactamente en el uso 4/12/25/45, «uso sin efecto» que no cuenta, burocracia del orco descontando reloj.
