# Cómo crear un juego nuevo

El motor, el cliente, el guardado, el despliegue y (según avancen las fases) el combate, los diálogos, las superficies y la IA se reutilizan tal cual. Un juego nuevo consiste en **historia, reglas y contenido**.

## 1. Historia (Fase 0 del juego nuevo)

Pídele a Claude premisas, elige una y desarrolladla igual que *Intereses*: situación, facciones, compañeros, antagonista, escenas, decisiones y diálogo de ejemplo. Se guarda en `docs/<juego>/STORY.md`.

## 2. Reglas: ¿heredar o crear?

| Caso | Qué hacer |
|---|---|
| Mismas reglas con otra ambientación | Usa `dnd5e` tal cual. |
| 5e con añadidos (condiciones propias, recursos nuevos como Fe) | `extendRuleset(dnd5e, { id: 'dnd5e-vampiros', resources: {...}, conditions: {...}, commands: {...} })` |
| Sistema distinto (clases propias, Sed, Fe y Luz, otro dado) | Crea `rulesets/<nombre>/` implementando `Ruleset` (`engine/ruleset.ts`). Puedes reutilizar `rulesets/common/` (pruebas d20, ventaja) o no hacerlo. `tests/fixtures/toyRuleset.ts` es un ejemplo mínimo con 2d6. |

Reglas de oro:
- Un ruleset solo importa de `engine/` y `rulesets/`.
- Si una mecánica nueva necesita algo que el motor no ofrece (por ejemplo, la iluminación), se añade **al motor como sistema genérico**, no al ruleset. Los efectos concretos de ese sistema van en el ruleset.
- Las etiquetas visibles para el jugador (nombres de recursos o condiciones) van en castellano dentro del ruleset.

## 3. Contenido: `content/<juego>/`

```
content/<juego>/
  meta.json               { "id", "title", "tagline" }: aparece en la portada de willysGate
  game.ts                 GameDefinition: ruleset, tema, textos, manifiesto, newGame()
  texts/ui.json           Textos de la interfaz y mensajes de error
  assets/manifest.json    Terrenos y sprites → archivos
  maps/*.json             Mapas de Tiled (ver "Mapas" en DESIGN.md)
  public/                 Arte y sonido (se sirve en la raíz del juego)
```

La forma más rápida de empezar es copiar `content/intereses/` y cambiar el `id`, el título, el ruleset, el tema y los textos.

## 4. Probar y desplegar

```bash
GAME=<juego> npm run dev
```

```bash
npm run check
```

```bash
npm run build:all
```

- `npm run dev` arranca el juego en local.
- `npm run check` pasa el typecheck y los tests.
- `npm run build:all` construye todos los juegos y la portada.

Al hacer push a `main`, GitHub Actions publica cada juego en `https://wilheim77.github.io/willysGate/<juego>/`.

## 5. Créditos

Cada asset nuevo se apunta en `CREDITS.md` y cada placeholder en `TODO-ART.md`, indicando el juego al que pertenece.
