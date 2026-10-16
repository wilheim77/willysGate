# CLAUDE.md

Grimdark isometric tactical RPG for the browser (inspired by BG3, retro pixel art). Project title: **Intereses**.

## Read first when resuming
1. `docs/PROGRESS.md`: current phase, what's done, next step.
2. `docs/BRIEF.md`: the original brief (requirements, architecture, phases).
3. `docs/STORY.md`: the approved story. `docs/DESIGN.md`: the living design.

## Non-negotiable rules
- Work in phases. Stop at the end of each phase and wait for the user's approval. Before starting a phase, give a short plan and wait for the go-ahead when it involves relevant design decisions.
- In-game text is Spanish (Castilian). Code, identifiers and comments are English.
- `core/` is pure TypeScript with no Phaser/DOM imports, testable in Node. All state lives in one serializable `GameState`. Every action is a command that returns the new state plus events. RNG is seeded and stored in the state. Every entity has a `controllerId`.
- Content is data in `content/`. Adding content must not require engine changes.
- No runtime LLM.
- Small, descriptive commits. Core tests must pass before every commit. Justify any heavy dependency.
- If a design request conflicts with the architecture, warn the user instead of working around it.
- Update `docs/PROGRESS.md` at the end of every session.
- Art: CC0/CC-BY only. Log every asset in `CREDITS.md` and every placeholder in `TODO-ART.md`.
