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

1. **[C/W] Clock expiry then walking froze the page for minutes.** FIXED, RE-TESTED on main: two rooms fell in 10 s, the page stayed responsive, Willy was dragged out (`entityTeleported`).
   Repro: floor 2, `systems.clock.remaining = 3`, walk ~14 steps. Each room fall emits 130-170 `tileChanged` events
   and `MapScene.play` rebuilt the whole world per event. Fix: coalesce rebuild-only events
   (`src/scenes/rebuildEvents.ts`, test `tests/game/rebuildEvents.test.ts`). Re-tested in the browser on qa: the room
   falls, the page stays responsive. The rules side is cheap (700 ms for 40 steps headless).
2. **[C] Resize/rotate leaves the camera where the old size put it: blank map.** FIXED on main (MapScene re-centres on
   `Phaser.Scale.Events.RESIZE`).
3. **[C] WebGL init failure aborts the whole setup flow silently.** FIXED on main (automatic fallback in `src/renderer.ts`; WebGL initialised fine in the re-test, so the failure path itself was not re-triggered). "Framebuffer status: Incomplete Attachment" ->
   `MapScene.setOverlays` throws (`this.overlay` undefined) inside `controller.refresh`; "A la mazmorra" lands on a
   blank map and the player never sees the casting screen (Butanero by default). Workaround on qa: `?canvas` forces
   the 2D renderer. Real fix: automatic Canvas fallback + guard `setOverlays`.
4. **[C/W] No tutorial at all, and the HUD is not gated.** FIXED on main, RE-TESTED: toasts show, floor-1 HUD gating works (audience and bag hidden until their step). Left: the first card in a new run is the achievements one (t10) in the Camerino, before "moverse"; the "atributos" card popped up in the middle of a clock collapse and covered the collapse banner (tutorial cards should wait for a calm moment); the clock HUD shows "Reloj 34:30" on floor 1 before its step. Original report: `content/willy/tutorial.json` (pasos with
   `disparador`/`texto[]`, `bloqueosIniciales`) has another shape than the client's `TutorialStep`; `game.tutorial`
   is not set in `content/willy/game.ts`. A new player gets zero guidance (no "tap to move", no combat explanation)
   and everything the design says is hidden at the start (audience, clock, bag, boxes, sponsors) is visible from the
   first second. Also the tutorial's own script talks about the casting happening after the plaza, but the casting
   is the first screen.
5. **[M/C] Box fatigue: 39 unopened boxes and 32 achievements after floor 3.** FIXED on willy-meta (ce172d3), RE-TESTED: the box list has "Abrir todas (15)" and one result screen ("15 cajas abiertas", items and +261 fichas, "A la mochila", "Abrir las nuevas (1)"); floor 1 now gives 15 boxes for 18 achievements (minor achievements give no box). Original report: Every achievement grants a box; each
   opened gear item raises a "Dárselo a Willy / Jonatan" prompt, and these prompts stack when several are pending
   (we saw 2 queued at once, one with no way to skip). The box list has no "Abrir todas" and no "Guardar todo en la
   mochila". Playing a normal session means dozens of taps and prompts. (Not a crash: a flow problem that will make
   the first impression of the game bad.)

25. **[C] Black screen after dying on a floor and returning to the Camerino (Con repetición).** FIXED on qa (mine, 4 lines in
    `MapScene` reset handler). Found in the 2026-10-23 re-test on main: the `reset` rebuild did not stop the camera
    follow, so it kept chasing a destroyed sprite of the floor just left (cam scroll 534,-302; only floating
    "+122 audiencia" text visible). Same for «Cargar» of a save from another map. Same-map returns (floor 1 -> Camerino 1
    in earlier runs) hid it. Fix: `stopFollow()` + `focusOn(controlled)` after `buildWorld` on `reset`; re-tested with a
    Camerino save loaded from planta-1 (Willy centred).

## Confusing

6. **[W] Chests do nothing.** `cofre` props (`botin:planta-N`, 6 hp objects) ignore taps; DESIGN.md says opening
   costs 3 s and gives 1 item + chips. No feedback either.
7. **[M] Box reveal spoils itself, and the gear prompt can't always be skipped.** FIXED on willy-meta, RE-TESTED (no prompt under the reveal; the sponsor-gift "Casco de obra" prompt now offers "3. Guardarlo en la mochila"). Original report: Opening a box immediately opens the
   "Guantes de fregar - Dárselo a Willy / a Jonatan" prompt under the reveal (item name faintly visible). Some
   prompts have "Guardarlo en la mochila", the ones from box/sponsor gifts have no "Luego" option.
8. **[W] The floor intro narrator uses the floor number as the planta.** Entering floor 2 says "Planta 2: el
   Hipermercado Eterno" while the floor is still Castro (floors 1-2 Castro, 3-4 Hipermercado).
9. **[C] Camerino NPCs (Maripuri, Paco, Xelda, Koldo) do nothing when tapped; fichas have no sink** (304 chips by
   floor 3, nothing to buy). At least answer with a line.
10. **[M/W] Narrator line names a different achievement than the banner.** FIXED on willy-meta (the narrator line is now part of the achievement banner; not re-verified in a double unlock). Banner "Planta limpia" + narrator "Logro
    desbloqueado, y encima de los raros: «Barbacoa de uno»" (two unlocked in the same command, {logro} resolves to the
    wrong one). Also «Primer figurante». "el Gaviota de lonja ha caído." (see 17).
11. **[C] Top bar at phone width:** only 174 px of the nav is visible (Guardar clipped, Cargar/Exportar/Importar/ **FIXED on main** (client): the bar fits, Guardar/Cargar on screen and Exportar peeks out as a swipe cue (re-tested).
    Nueva/sound reachable only by swiping, no hint). Save is hard to find on a phone.
12. **[C] Initiative strip overlapped by the clock/audience widgets** at 375 px once there are 5+ combatants. **FIXED on main** (client): the clock sits below the strip (re-tested with 5 combatants, no overlap).
13. **[W] Rival dialogue says "CD 15", the roll log says "DIF 15"** (and the attack preview says "Defensa"). Pick one.
14. **[W] When Willy goes down mid-fight nothing happens** for 10+ rounds: the fight continues with the companion
    only, the player gets no message, and the defeat prompt only appears after Jonatan falls too (or wins). A one-line
    "Willy está fuera de combate" would help.
15. **[S] Sponsor contract feasibility.** "Descubre 2 trampas" is offered on floor 1 for floor 2; floor 3 can have 0
    traps (seeds 3 and 6 headless), so such a contract must only be offered when the target floor has enough.
16. **[C] Title "Nueva partida" with an existing save** starts at once (the "Continuar" slot is only overwritten by the
    next "Guardar"); in-game "Nueva" uses a native `confirm()` (fine in a browser, blocked in embedded webviews).

26. **[C] Tutorial timing (re-test 2026-10-23).** (a) "Bienvenido a la Planta 1" card appears in the Camerino at run
    start, before the player has seen the floor; (b) the combat card ("¡Ratas!") covers the whole arena during the first
    enemy turn, so the first fight is not visible until it is closed; (c) the "Vas por la mitad de vida" card fires at
    the instant of death (HP 0) and stays over the defeat/return screen; (d) clock HUD already shown on floor 1 before
    its step. Sent to the client agent.
27. **[M] Maripuri shop hides what you cannot afford** ("Si no lo ves es que no te llega"): with 0 fichas the shop shows only
    "Nada más, gracias." Works as written, but a first visit looks like a broken shop. Suggest listing prices greyed out.

## Cosmetic

17. **[M] Narrator grammar:** FIXED on willy-meta (gender + capital; not re-verified). "«Primer figurante». el Gaviota de lonja ha caído." (lowercase "el" after a full stop,
    wrong gender: `{enemigo:el}` in achievements.json ignores the enemy's gender; the rest of the narrator handles it).
18. **[C] Casting stat line "+8 -> 10 (+0)" has no label; "Puntos libres: 0" with 3 points already spent.** **FIXED on main** (client): sum display "8 + 2 = 10".
19. **[C] Item card description clipped in the box reveal** ("Inmune a Envenenado por superficies." cut at 375 px). **FIXED on qa/main** (mine): cards grow with their text (re-tested: 162 and 175 px cards, nothing clipped).
20. **[C] Floating "+248 au..." text is huge, overlaps Willy and is clipped at 375 px.** **FIXED on main** (client): floating text clamped to the view.
21. **[C] HUD (bag, boxes, achievements, save) is clickable over the title/difficulty/mode/casting screens.** **FIXED on main** (client: setup/casting/intro screens are opaque); also not reachable by real taps before.
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

- Re-test on main 2026-10-23 (375x812, Prime time + Con repetición, then Turista): casting rows "6 + 2 = 8", difficulty
  text describes effects; Maripuri shop works (200 fichas: 5 items, buying a pincho took 15 fichas and put it in the bag);
  equipping 4 hand weapons in a row from the bag (Llave inglesa, Palo de selfie, Teclado Casio, Bastón con pomo) swaps
  correctly each time, the displaced weapon goes back to the bag or to Iker/Jonatan, no "who wears it?" loop and no stale
  prompt (the hidden #dialogue DOM keeps old buttons: do not read it without checking `hidden`); floor 1 fight won with
  the companion, "Caja de oro" reward; Con repetición death -> "Volver al Camerino" -> full HP, checkpoint gear, boxes
  back to the checkpoint count (see #25 for the camera).

## Not covered

Floors 4+ beyond the first fight, boss phases (trapdoors, dark phase, vote), season ending, audio, Sin repetición
reload mid-run (restored-copy rule), traps/barrels by hand, WebGL renderer on a real GPU.
