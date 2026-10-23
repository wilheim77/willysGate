# Willy - in-browser playtest log

QA reviewer pass (cheap Fable stand-in). Phone size 375x812, dev server `GAME=willy npx vite --port 5186`,
Canvas renderer (`?canvas=1`, see B3). Driving: real clicks for menus/HUD, synthetic taps on the canvas for
tiles, `window.__game` only to read state or skip walking.
Order: blocker > confusing > cosmetic. Owner in brackets: W = Willy agent (rules, floors), M = meta (boxes, bag,
modes, achievements), C = client (UI, tutorial, audio), S = show (audience, sponsors).
Status: OPEN unless marked FIXED (branch qa).

## Blockers

1. **[C/W] Clock expiry then walking froze the page for minutes.** FIXED on qa (needs main).
   Repro: floor 2, set `systems.clock.remaining = 3`, walk ~14 steps. Each room fall emits 130-170 `tileChanged`
   events and `MapScene.play` rebuilt the whole world per event. Fix: coalesce rebuild-only events
   (`src/scenes/rebuildEvents.ts`, test `tests/game/rebuildEvents.test.ts`). Rules side suggestion (W): emit one
   aggregated tiles event per fall.
2. **[C] Resize/rotate leaves the camera where the old size put it: blank map.** FIXED on qa (MapScene
   re-centres on `Phaser.Scale.Events.RESIZE`).
3. **[C] WebGL init failure aborts the whole setup flow silently.** "Framebuffer status: Incomplete Attachment" ->
   `MapScene.setOverlays` throws (`this.overlay` undefined) inside `controller.refresh`, "A la mazmorra" lands on a
   blank map and the player never gets the casting screen (default Butanero). Workaround on qa: `?canvas` forces the
   2D renderer. Real fix: automatic Canvas fallback + guard `setOverlays`.
4. **[C/W] Tutorial never shows and its gating is not applied.** `content/willy/tutorial.json` (pasos with
   `disparador`/`texto[]`, `bloqueosIniciales`) has another shape than the client's `TutorialStep` and
   `game.tutorial` is not set in `content/willy/game.ts`. Result: a new player gets zero guidance, and the HUD the
   design says is hidden at start (audience, clock, bag, boxes, sponsors) is all visible from the first second.
5. **[W] Chests do nothing.** `cofre` props (`botin:planta-N`, 6 hp objects) ignore taps in exploration; DESIGN.md
   says opening costs 3 s and gives 1 item + chips. No feedback either. (Boxes from achievements work.)

## Confusing

6. **[M] Box reveal spoils itself and the gear prompt can't be skipped.** Opening a box immediately opens the
   "Guantes de fregar - Dárselo a Willy / a Jonatan" prompt under the reveal animation (item name faintly visible),
   and that prompt has no "Luego"/"Dejarlo" option (bag use prompt has "Dejarlo").
7. **[M] 29 unopened boxes after floor 1.** Every achievement gives a bronze box; the list has no "Abrir todas".
   (17 achievements by floor 2 in ~10 min.)
8. **[W] Floor 2 narrator says "Planta 2: el Hipermercado Eterno" but the floor is still Castro (same tiles,
   gaviotas, ratas).** Narrator uses the floor number as planta; there are two floors per planta now.
9. **[C] Camerino NPCs (Maripuri, Paco, Xelda, Koldo) are decorative: tapping them does nothing; fichas have no
   sink (68 chips, no shop).** At least show a line or "no tiene nada que decirte".
10. **[S] Sponsor contract may be impossible.** Seguros La Prudente offered "descubre 2 trampas" (applies to
    floor 2) while floor 1 had no traps at all; verify floor 2 generates traps whenever this contract can be
    offered.
11. **[C] Top bar at phone width:** only 174 px of the nav is visible (Guardar clipped, Cargar/Exportar/Importar/
    Nueva/sound reachable only by swiping, no hint). Save is hard to find on a phone.
12. **[C] Initiative strip overlapped by the clock/audience widgets** at 375 px once there are 5+ combatants.
13. **[M] Rival dialogue says "CD 15", the roll log says "DIF 15"** (and the attack preview says "Defensa").
    Pick one term.

## Cosmetic

14. **[M] Narrator grammar in an achievement:** "«Primer figurante». el Gaviota de lonja ha caído." (lowercase
    "el" after a full stop, wrong gender: `{enemigo:el}` ignores the enemy's gender in achievements.json).
15. **[C] Casting stat line "+8 -> 10 (+0)" has no label; "Puntos libres: 0" with 3 points already spent.**
16. **[C] Item card description clipped in the box reveal** ("Inmune a Envenenado por superficies." cut).
17. **[C] Floating "+248 au..." text is huge, overlaps Willy and is clipped at 375 px.**
18. **[C] HUD (bag, boxes, achievements, save) is clickable over the title/difficulty/mode/casting screens.**
19. **[C] Achievement toast and narrator bubble repeat the same text; stale gear-prompt buttons stay in the DOM.**
20. **[S] Sponsor affinity bars are partly filled at "Afinidad 0".**

## Verified OK

Title -> difficulty -> mode (Sin repetición correctly greyed out on Turista, with the reason) -> casting (9 classes,
phone layout fine) -> Camerino; bag; box scene (probabilities screen, reveal, "Abrir otra (n)"); sponsor panel in
Spanish with Firmar/Rechazar; character sheet; combat preview ("95 % · ~6 de daño"), Hacer el ganso raises the
audience; level-up banner; rival dialogue (Derrotar / Pactar with check / Dejar ir) and fight; lift Camerino ->
floor 2; save ("Parte de planta firmado"); clock HUD, warning text and room cracking message.

## Not yet covered

Floors 3+, boss (jefe-centollo) fight, traps/barrels, death with Con repetición (return to Camerino) and Sin
repetición (permadeath slot deleted, summary), season ending, audio.
