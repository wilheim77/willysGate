# CLAUDE.md

Reusable engine for grimdark isometric tactical RPGs in the browser (inspired by BG3, retro pixel art), plus the games built on it. First game: **Intereses** (`content/intereses/`, ruleset `dnd5e`). Repo/deploy name: willysGate.

## Read first when resuming
1. `docs/PROGRESS.md`: current phase, what's done, next step.
2. `docs/BRIEF.md`: the original brief (requirements, architecture, phases).
3. `docs/DESIGN.md`: architecture (engine / rulesets / content layers). `docs/NEW_GAME.md`: how to add a game.
4. `docs/STORY.md`: the approved story of Intereses.

## Non-negotiable rules
- Work in phases. Stop at the end of each phase and wait for the user's approval. Before starting a phase, give a short plan and wait for the go-ahead when it involves relevant design decisions.
- In-game text is Spanish (Castilian). Code, identifiers and comments are English.
- Layers: `engine/` is generic and knows no game rules (no AC, spell slots, d20...). `rulesets/<id>/` implements the `Ruleset` interface. `content/<game>/` holds data and the `GameDefinition`. `src/` is the generic Phaser client. `tests/architecture.test.ts` enforces imports. If a feature seems to need 5e logic inside `engine/`, warn the user first.
- `engine/` and `rulesets/` are pure TypeScript with no Phaser/DOM imports, testable in Node. All state lives in one serializable `GameState`. Every action is a command that returns the new state plus events. RNG is seeded and stored in the state. Every entity has a `controllerId`. Entity stats/resources/conditions are generic maps defined by the ruleset.
- Content is data in `content/<game>/`. Adding content must not require engine changes.
- No runtime LLM.
- Small, descriptive commits. `npm run check` (typecheck + tests) must pass before every commit. Justify any heavy dependency.
- If a design request conflicts with the architecture, warn the user instead of working around it.
- Update `docs/PROGRESS.md` at the end of every session.
- Art: CC0/CC-BY only. Log every asset in `CREDITS.md` and every placeholder in `TODO-ART.md`.

## Cuaderno de proyectos
Al terminar una sesión en la que haya cambiado algo, actualiza la página `proyectos/willysgate.md` del repo
`wilheim77/Notas` (Estado, Siguiente paso y una línea nueva arriba del Diario) y su fila en
`Inicio.md`. Si `Notas` no está en la sesión, añádelo. Breve, en español sencillo y sin datos
sensibles (ni cifras de dinero, ni salud, ni claves). Reglas completas en el CLAUDE.md de `Notas`.
