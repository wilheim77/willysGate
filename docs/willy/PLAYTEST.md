# Willy - in-browser playtest log

QA reviewer pass (cheap stand-in while the Fable reviewer is paused). Phone size 375x812, dev server
`GAME=willy npx vite --port 5186`, Canvas renderer (`?canvas=1`, see B3). Real clicks for menus/HUD, synthetic taps on
the canvas for tiles, `window.__game` to read state and to skip long walks/fights (AI-driven, state only).
Order: blocker > confusing > cosmetic. Owner in brackets: W = Willy agent (rules, floors), M = meta (boxes, bag, modes,
achievements), C = client (UI, tutorial, audio), S = show (audience, sponsors).
Status OPEN unless marked FIXED (branch qa) or RETEST (needs a re-test once on main).

Path covered (Turista + Con repetición, then Concursante + Sin repetición): title -> intro (16 slides) -> difficulty ->
mode -> casting -> Camerino -> floors 1, 2, 3 (cleared; floor 2 boss Centollo beaten) -> rival (Pactar fail ->
Derrotar) -> boxes (opened, probabilities, reveal) -> bag -> sponsor panel (signed a contract) -> save/load ->
clock expiry -> death with Con repetición (returns to the last Camerino) and with Sin repetición (permadeath slot
deleted, season summary).

## Blockers

1. **[C/W] Clock expiry then walking froze the page for minutes.** FIXED on qa, RETEST on main (3744304).
   Repro: floor 2, `systems.clock.remaining = 3`, walk ~14 steps. Each room fall emits 130-170 `tileChanged` events
   and `MapScene.play` rebuilt the whole world per event. Fix: coalesce rebuild-only events
   (`src/scenes/rebuildEvents.ts`, test `tests/game/rebuildEvents.test.ts`). Re-tested in the browser on qa: the room
   falls, the page stays responsive. The rules side is cheap (700 ms for 40 steps headless).
2. **[C] Resize/rotate leaves the camera where the old size put it: blank map.** FIXED on qa (MapScene re-centres on
   `Phaser.Scale.Events.RESIZE`).
3. **[C] WebGL init failure aborts the whole setup flow silently.** "Framebuffer status: Incomplete Attachment" ->
   `MapScene.setOverlays` throws (`this.overlay` undefined) inside `controller.refresh`; "A la mazmorra" lands on a
   blank map and the player never sees the casting screen (Butanero by default). Workaround on qa: `?canvas` forces
   the 2D renderer. Real fix: automatic Canvas fallback + guard `setOverlays`.
4. **[C/W] No tutorial at all, and the HUD is not gated.** `content/willy/tutorial.json` (pasos with
   `disparador`/`texto[]`, `bloqueosIniciales`) has another shape than the client's `TutorialStep`; `game.tutorial`
   is not set in `content/willy/game.ts`. A new player gets zero guidance (no "tap to move", no combat explanation)
   and everything the design says is hidden at the start (audience, clock, bag, boxes, sponsors) is visible from the
   first second. Also the tutorial's own script talks about the casting happening after the plaza, but the casting
   is the first screen.
5. **[M/C] Box fatigue: 39 unopened boxes and 32 achievements after floor 3.** Every achievement grants a box; each
   opened gear item raises a "Dárselo a Willy / Jonatan" prompt, and these prompts stack when several are pending
   (we saw 2 queued at once, one with no way to skip). The box list has no "Abrir todas" and no "Guardar todo en la
   mochila". Playing a normal session means dozens of taps and prompts. (Not a crash: a flow problem that will make
   the first impression of the game bad.)

## Confusing

6. **[W] Chests do nothing.** `cofre` props (`botin:planta-N`, 6 hp objects) ignore taps; DESIGN.md says opening
   costs 3 s and gives 1 item + chips. No feedback either.
7. **[M] Box reveal spoils itself, and the gear prompt can't always be skipped.** Opening a box immediately opens the
   "Guantes de fregar - Dárselo a Willy / a Jonatan" prompt under the reveal (item name faintly visible). Some
   prompts have "Guardarlo en la mochila", the ones from box/sponsor gifts have no "Luego" option.
8. **[W] The floor intro narrator uses the floor number as the planta.** Entering floor 2 says "Planta 2: el
   Hipermercado Eterno" while the floor is still Castro (floors 1-2 Castro, 3-4 Hipermercado).
9. **[C] Camerino NPCs (Maripuri, Paco, Xelda, Koldo) do nothing when tapped; fichas have no sink** (304 chips by
   floor 3, nothing to buy). At least answer with a line.
10. **[M/W] Narrator line names a different achievement than the banner.** Banner "Planta limpia" + narrator "Logro
    desbloqueado, y encima de los raros: «Barbacoa de uno»" (two unlocked in the same command, {logro} resolves to the
    wrong one). Also «Primer figurante». "el Gaviota de lonja ha caído." (see 17).
11. **[C] Top bar at phone width:** only 174 px of the nav is visible (Guardar clipped, Cargar/Exportar/Importar/ **FIXED on qa**: at <=560 px the title is hidden so Guardar/Cargar are on screen and Exportar peeks out as a swipe cue.
    Nueva/sound reachable only by swiping, no hint). Save is hard to find on a phone.
12. **[C] Initiative strip overlapped by the clock/audience widgets** at 375 px once there are 5+ combatants. **FIXED on qa**: in combat at <=560 px the clock drops below the strip (verified: no overlap with 5 combatants).
13. **[W] Rival dialogue says "CD 15", the roll log says "DIF 15"** (and the attack preview says "Defensa"). Pick one.
14. **[W] When Willy goes down mid-fight nothing happens** for 10+ rounds: the fight continues with the companion
    only, the player gets no message, and the defeat prompt only appears after Jonatan falls too (or wins). A one-line
    "Willy está fuera de combate" would help.
15. **[S] Sponsor contract feasibility.** "Descubre 2 trampas" is offered on floor 1 for floor 2; floor 3 can have 0
    traps (seeds 3 and 6 headless), so such a contract must only be offered when the target floor has enough.
16. **[C] Title "Nueva partida" with an existing save** starts at once (the "Continuar" slot is only overwritten by the
    next "Guardar"); in-game "Nueva" uses a native `confirm()` (fine in a browser, blocked in embedded webviews).

## Cosmetic

17. **[M] Narrator grammar:** "«Primer figurante». el Gaviota de lonja ha caído." (lowercase "el" after a full stop,
    wrong gender: `{enemigo:el}` in achievements.json ignores the enemy's gender; the rest of the narrator handles it).
18. **[C] Casting stat line "+8 -> 10 (+0)" has no label; "Puntos libres: 0" with 3 points already spent.** **FIXED on qa**: stat rows read "10 (base 8 + 2)" (new optional `format` on the points step; Intereses keeps its 5e style), help text says the points are already spread like the Narrator would.
19. **[C] Item card description clipped in the box reveal** ("Inmune a Envenenado por superficies." cut at 375 px). **FIXED on qa**: cards grow with their text.
20. **[C] Floating "+248 au..." text is huge, overlaps Willy and is clipped at 375 px.** **FIXED on qa**: long floats shrink with their length (min 0.26 of a tile) - visual re-check pending.
21. **[C] HUD (bag, boxes, achievements, save) is clickable over the title/difficulty/mode/casting screens.** **Not a bug**: the setup/title overlays cover the bar for real taps; it was reachable only through scripted DOM clicks.
22. **[C] Achievement toasts and narrator bubbles repeat the same text, and toasts draw over the defeat/season summary.** **FIXED on qa** for the z-order (toast now under the dialogue layer); the toast and the narrator line are different texts, left as is.
23. **[C] Intro slide 6 banner reads "OEN DIRECTO"** (the REC dot is drawn as an "O" glued to "EN DIRECTO"). **FIXED on qa**: the REC dot sits left of "EN DIRECTO" (spec edited, panel PNG rebuilt).
24. **[S] Sponsor affinity bars are partly filled at "Afinidad 0".**

## Verified OK

- Title -> intro (16 slides, all Spanish, "Saltar" works) -> difficulty -> mode (Sin repetición greyed out on Turista
  with the reason; on Concursante it shows "Una sola vida. Se guarda solo y no se puede volver atrás.") -> casting
  (9 classes, phone layout fine) -> Camerino -> lift.
- Bag (asks who, "Dejarlo"), box scene (probabilities screen, tap to open, "Revelar todo", "Abrir otra (n)"), character
  sheet, sponsor panel in Spanish with Firmar/Rechazar, combat preview ("95 % · ~6 de daño"), Hacer el ganso raises
  the audience, level-up banner, achievement toasts, save ("Parte de planta firmado") and load ("Partida cargada.
  Seguimos en antena."), clock HUD + warning text + cracking.
- Rival (Paqui la Elegante): Derrotar / Pactar (Carisma check shown with %) / Dejar ir; failed Pactar offers Derrotar /
  Dejar ir; the fight works.
- Floors 1-3 cleared headlessly in the browser (about 60 fights), boss Centollo on floor 2: no crash, no hang.
- Con repetición death: "Willy ha caído... 1. Volver al Camerino" -> back in camerino-1 with full HP, attempt counter
  1, progress after the Camerino gone as the text promises.
- Sin repetición death: Guardar/Cargar/Exportar/Importar hidden during the run, slot `willysgate.willy.hardcore`
  exists while playing and is deleted on defeat, summary (planta, nivel, logros, cajas, fichas) and "Nueva temporada".

## Not covered

Floors 4+ beyond the first fight, boss phases (trapdoors, dark phase, vote), season ending, audio, Sin repetición
reload mid-run (restored-copy rule), traps/barrels by hand, WebGL renderer on a real GPU.
