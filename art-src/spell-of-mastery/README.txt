Spell of Mastery -- Character + Monster Sprite Pack
===================================================

This zip contains the raw PNG assets ready to drop into your game.

  character-layers/   112 layered character parts (4 cols x 6 rows
                      grid of 96x96 frames per layer; mix-and-match
                      across 21 z-ordered slots).
  monsters/           19 monster sprite sheets (each with a .txt
                      manifest giving frame bounding boxes +
                      animation sequences) + 2 folder-mode monsters
                      (cyclops, demon -- one PNG per frame, name
                      format "<dir>-<anim><idx>.png").

LAYERED CHARACTER SYSTEM (z-order, back to front)

  toolB, offhandB, capeB,
  (body kit goes here -- one of: db*=male / df*=female /
   ds*=skeleton-undead / none),
  gloves (g*), pants (p*), footwear (f*), skirt (s*),
  chest (c{N}{m|f}), belt (b*), arms (a*),
  cape -- m-prefix = mantle, m1h is the hood overlay for m1,
  necklace (n*), beard (j*, male-only), wig (w{N}{m|}),
  headgear (h*), hood (h* used in hood slot for hooded mantles
   like m1+m1h), offhand (o*, with o*b being the back layer),
  tool (t*, with t*b being the back-of-tool layer).

  Chest c{N}m + c{N}f are same-design opposite-sex pairs that
  swap together on a gender switch.  Wig w{N}m + w{N} pair the
  same way.

  *b suffix on tools/capes/offhands = the back-of-item layer
   drawn BEHIND the body silhouette in z-order; the front-side
   half is the bare name (e.g. t0 + t0b).

ANIMATIONS (per agnt/_base.txt frame grid, 4 cols x 6 rows of 96x96)

  South facing -- rows 0-2.  North facing -- rows 3-5.
  Col 0: idl1 / mv1 / atk1
  Col 1: aware (= idle-alert) / mv2 / atk2 (with swoosh overlay
         for melee weapons)
  Col 2: fall / mv3 / atk3 (apex of attack)
  Col 3: lay (dead, ground) / mv4 / point (taunting/casting pose)

  Col 4 is computed at composition time -- idle frames idl2 /
  idl3 / idl4 with subtle head-bob (+1 / +2 / +1 px vertical
  jitter), source pulled from row 0 / row 3.

MONSTERS

  Each monster has its own anim set (varies; common: idle, move,
  blow, back, death, hurt).  blow + back together form the full
  attack cycle: blow is the windup before the hit registers, back
  is the recovery to idle pose.  Use them concatenated.

  The interactive composer (companion file
  spell-of-mastery-sprite-composer.html) recolors the monster
  sheets' "team color" pixels (the seven-shade red-orange
  BuiltinRecolor palette) to any of 13 named team colors at
  preview time.  The source PNGs in this zip use the red source
  palette; do the same swap in your engine to support per-team
  monsters.

LICENSE

  CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Credit "NancyGold / Spell of Mastery" in your game's credits
  or about box.  Commercial use OK.  Sharing modified derivatives
  is encouraged, same license.

WHO MADE THIS

  Built with Symta (https://symta.aermia.com), a Lisp dialect
  for indie gamedev.  Used in-game by Spell of Mastery
  (https://som.aermia.com -- work-in-progress turn-based fantasy
  strategy).  Both projects by Nancy Sadkov / NancyGold on
  itch.io.

  Found a bug, want a layer added, or just want to say hi?
  https://nancygold.itch.io/
