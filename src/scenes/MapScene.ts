import Phaser from 'phaser';
import {
  type EntityMovedEvent,
  type EntityTeleportedEvent,
  type GameEvent,
  type GameState,
  type LightSource,
  type Tile,
  type Vec2,
  blockedTiles,
  findPath,
  movePath,
  surfaceCost,
  surfaceHazard,
  hasCondition,
  isHostile,
  type Entity,
  isEvent,
  lightPosition,
  lightingOf,
  surfacesOf,
  trapsOf,
  tileAt,
} from '../../engine';
import { DEFAULT_FX, Juice, tween, wait } from '../fx/juice';
import { type AssetManifest, type LpcAnimation, type SpellFx, type SpriteArt, assetUrl, tilesetKey } from '../assets/manifest';
import { LightingLayer } from '../fx/LightingLayer';
import type { Theme } from '../game/definition';
import type { GameStore } from '../game/store';
import { GridProjection } from '../projection';

export interface MapSceneHooks {
  /**
   * The player tapped/clicked a tile. `entityId` is the creature whose sprite was under the
   * pointer, if any: sprites stick out above their tile, so tapping a body or head would
   * otherwise land on the tile above.
   */
  onTileSelected(tile: Vec2, entityId?: string): void;
  /** Pointer is over a tile (or nothing). */
  onTileHovered(tile: Vec2 | null): void;
  controlledEntityId(): string;
  /** All queued events have finished animating. */
  onIdle?(): void;
}

/** Texts the event player shows over the map (Spanish, from the game's ui texts). */
export interface MapSceneTexts {
  miss: string;
  crit: string;
  downed: string;
  saved: string;
  failed: string;
  combatStart: string;
  victory: string;
  defeat: string;
  fell?: string;
  slipped?: string;
  trapSpotted?: string;
  trapTriggered?: string;
  trapDisarmed?: string;
  trapDisarmFailed?: string;
}

const STEP_MS = 160;
/** Out of combat walking is brisker: exploring shouldn't feel like wading. */
const EXPLORE_STEP_MS = 95;
/** Darkens tiles nobody can walk on (walls, roofs, rubble) so they stand apart from floors. */
const BLOCKED_TINT = 0x8a8a8a;
/** Longest any one event may animate before playback moves on regardless. */
const EVENT_WATCHDOG_MS = 10_000;
const TAP_SLOP = 8;
/** Zoom limits and defaults are expressed as on-screen pixels per tile, whatever the art's tile size. */
const MIN_TILE_PX = 24;
const MAX_TILE_PX = 128;
const DEFAULT_TILE_PX = { desktop: 64, mobile: 48 };
const LIGHTING_DEPTH = 900_000;
/** LPC frames are 64px with the feet around y=60; oversized frames centre that 64px box. */
const LPC_BASE = 64;
const LPC_FEET_Y = 60;

/**
 * Facing. 4-direction art (LPC) uses all four; 2-direction art (0x72) only
 * distinguishes left/right and flips the sprite.
 */
type Dir = 'n' | 'w' | 's' | 'e';
const DIR_ROWS: Dir[] = ['n', 'w', 's', 'e'];

/**
 * Which event triggers the 'cast' animation + a `manifest.fx` lookup, and which of its
 * fields to read, when the game's manifest doesn't say otherwise (`AssetManifest.castEvent`)
 * — dnd5e's own `spellCast` shape (see rulesets/dnd5e/actions.ts).
 */
const DEFAULT_CAST_EVENT = { type: 'spellCast', casterField: 'casterId', idField: 'spellId', targetField: 'target', tilesField: 'tiles' };

/** Stable per-tile variant choice so floors don't look tiled. */
const variantHash = (x: number, y: number): number => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
/** One texture per image file; several sprites can share an atlas. */
const imageKey = (url: string): string => `img:${url}`;

interface DrawnTile {
  pos: Vec2;
  /** Top surface plus face, in world pixels, for picking. */
  bounds: Phaser.Geom.Rectangle;
}

/** Renders the GameState top-down (3/4) and turns input into tile selections. It never mutates state. */
export class MapScene extends Phaser.Scene {
  private tiles: DrawnTile[] = [];
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private shadows = new Map<string, Phaser.GameObjects.Ellipse | Phaser.GameObjects.Sprite>();
  private lighting: LightingLayer | null = null;
  private facing = new Map<string, Dir>();
  private breathing = new Map<string, Phaser.Tweens.Tween>();
  private pathPreview!: Phaser.GameObjects.Graphics;
  private animating = 0;
  /** Settles the walk in flight per entity (see animateMove). */
  private moveFinish = new Map<string, () => void>();
  private queue: GameEvent[] = [];
  private playing = false;
  /** A spellCast immediately followed by its own attackRolled should skip the plain 'attack' animation. */
  private suppressNextAttackAnim = false;
  private juice!: Juice;
  private overlay!: Phaser.GameObjects.Graphics;
  private activeRing: Phaser.GameObjects.Ellipse | null = null;
  private activeId: string | null = null;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragging = false;
  private pinchDistance: number | null = null;
  private grid: GridProjection;
  private propSprites: Phaser.GameObjects.Sprite[] = [];
  private surfaceObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private store: GameStore,
    private manifest: AssetManifest,
    private theme: Theme,
    private hooks: MapSceneHooks,
    private texts: MapSceneTexts,
  ) {
    super('map');
    this.grid = new GridProjection(manifest.tile.size, manifest.tile.levelHeight);
  }

  preload(): void {
    for (const [id, ts] of Object.entries(this.manifest.tilesets)) {
      this.load.spritesheet(tilesetKey(id), assetUrl(ts.url), { frameWidth: ts.frameWidth, frameHeight: ts.frameHeight });
    }
    for (const art of [...Object.values(this.manifest.sprites), ...Object.values(this.manifest.props ?? {}), ...Object.values(this.manifest.surfaces ?? {})]) {
      if (!this.textures.exists(imageKey(art.url))) this.load.image(imageKey(art.url), assetUrl(art.url));
    }
  }

  create(): void {
    this.defineCharacterFrames();
    this.defineProps();
    this.defineSurfaceAnims();
    this.pathPreview = this.add.graphics().setDepth(1_000_000);
    this.overlay = this.add.graphics().setDepth(999_000);
    this.juice = new Juice(this, this.grid.tile, DEFAULT_FX);
    this.buildWorld(this.store.state);

    const unsubscribe = this.store.subscribe((change, state) => {
      if (change.kind === 'reset') {
        this.queue = [];
        this.buildWorld(state);
      } else {
        this.queue.push(...change.events);
        void this.playQueue();
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

    this.applyColorGrade();
    this.setupInput();
    const T = this.grid.tile;
    this.cameras.main.setZoom((this.scale.width < 700 ? DEFAULT_TILE_PX.mobile : DEFAULT_TILE_PX.desktop) / T);
    this.focusOn(this.hooks.controlledEntityId());
  }

  /** One camera-wide colour filter unifies the palette of every art pack (WebGL only). */
  private applyColorGrade(): void {
    const grade = this.manifest.grade ?? this.theme.colorGrade;
    const fx = this.cameras.main.postFX;
    if (!grade || !fx) return;
    const matrix = fx.addColorMatrix();
    matrix.saturate(grade.saturation);
    matrix.brightness(grade.brightness, true);
    if (grade.tint) {
      const c = Phaser.Display.Color.HexStringToColor(grade.tint);
      fx.addColorMatrix().multiply([c.redGL, 0, 0, 0, 0, 0, c.greenGL, 0, 0, 0, 0, 0, c.blueGL, 0, 0, 0, 0, 0, 1, 0]);
    }
  }

  // --- World -------------------------------------------------------------

  private buildWorld(state: GameState): void {
    for (const o of this.worldObjects) o.destroy();
    this.worldObjects = [];
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    for (const s of this.shadows.values()) s.destroy();
    this.shadows.clear();
    this.lighting?.destroy();
    for (const t of this.breathing.values()) t.remove();
    this.breathing.clear();
    this.tiles = [];

    const { map } = state;
    const T = this.grid.tile;
    const LH = this.grid.levelH;
    const heightAt = (x: number, y: number): number | null => {
      const t = tileAt(map, { x, y });
      return t && t.terrain !== 'void' ? t.height : null;
    };

    const cells: { pos: Vec2; tile: Tile }[] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = tileAt(map, { x, y })!;
        if (tile.terrain !== 'void') cells.push({ pos: { x, y }, tile });
      }
    }
    cells.sort((a, b) => this.grid.depth(a.pos.y, a.tile.height) - this.grid.depth(b.pos.y, b.tile.height));

    for (const { pos, tile } of cells) {
      const art = this.manifest.terrain[tile.terrain] ?? Object.values(this.manifest.terrain)[0]!;
      const h = tile.height;
      const c = this.grid.tileCentre(pos.x, pos.y, h);
      const depth = this.grid.depth(pos.y, h);
      const key = tilesetKey(art.tileset);

      // Cliff or wall face below raised tiles: one band of `levelH` pixels per level.
      if (h > 0) {
        const face = this.add
          .tileSprite(c.x, c.y + T / 2 + (h * LH) / 2, T, h * LH, key, art.face)
          .setTint(0xb0b0b0)
          .setDepth(depth);
        this.worldObjects.push(face);
      }
      // One walkable level above walkable ground to the south: that's a stair, not a ledge.
      // Draw treads on its face and no stone lip, so it reads as "you can go up here".
      const south = tileAt(map, { x: pos.x, y: pos.y + 1 });
      const stair = h > 0 && tile.walkable && south?.walkable === true && south.terrain !== 'void' && h - south.height === 1;
      if (stair) {
        const treads = this.add.graphics().setDepth(depth + 0.5);
        const faceTop = c.y + T / 2;
        for (let i = 0; i < 3; i++) {
          const y = faceTop + ((i + 0.5) * LH) / 3;
          treads.fillStyle(0xd8c8a8, 0.35).fillRect(c.x - T / 2, y - 1, T, 1);
          treads.fillStyle(0x000000, 0.35).fillRect(c.x - T / 2, y, T, 1);
        }
        this.worldObjects.push(treads);
      }
      if (h > 0 && art.rim !== undefined && !stair) {
        // A single lip at the platform's south edge (the rest of the frame is transparent).
        this.worldObjects.push(this.add.image(c.x, c.y + T, key, art.rim).setDepth(depth + 0.5));
      }
      const frame = art.frames[variantHash(pos.x, pos.y) % art.frames.length]!;
      const surface = this.add.image(c.x, c.y, key, frame).setDepth(depth + 1);
      // Where you can't walk must read as such at a glance (playtest: "is that a wall or the
      // floor?"): blocked tiles are darker, with a hard edge facing the walkable ground.
      if (!tile.walkable) surface.setTint(BLOCKED_TINT);
      this.worldObjects.push(surface);
      this.drawFringes(map, pos, tile, c, depth);

      // Readability of elevation: dark rims where the ground drops, soft shadows where it rises.
      const g = this.add.graphics().setDepth(depth + 2);
      const left = c.x - T / 2;
      const top = c.y - T / 2;
      const north = heightAt(pos.x, pos.y - 1);
      const west = heightAt(pos.x - 1, pos.y);
      const east = heightAt(pos.x + 1, pos.y);
      g.fillStyle(0x000000, 0.55);
      if (north === null || north < h) g.fillRect(left, top, T, 1);
      if (west === null || west < h) g.fillRect(left, top, 1, T);
      if (east === null || east < h) g.fillRect(left + T - 1, top, 1, T);
      // Light comes from the north-west: higher ground there casts a shadow on this tile.
      if (north !== null && north > h) {
        const s = Math.min(T, (north - h) * LH);
        g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0.45, 0, 0).fillRect(left, top, T, s);
      }
      if (west !== null && west > h) {
        const s = Math.min(T, (west - h) * LH);
        g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.4, 0, 0.4, 0).fillRect(left, top, s, T);
      }
      if (!tile.walkable) {
        const open = (x: number, y: number) => tileAt(map, { x, y })?.walkable === true;
        g.fillStyle(0x000000, 0.8);
        if (open(pos.x, pos.y + 1)) g.fillRect(left, top + T - 2, T, 2);
        if (open(pos.x, pos.y - 1)) g.fillRect(left, top, T, 2);
        if (open(pos.x - 1, pos.y)) g.fillRect(left, top, 2, T);
        if (open(pos.x + 1, pos.y)) g.fillRect(left + T - 2, top, 2, T);
      }
      this.worldObjects.push(g);
      this.tiles.push({ pos, bounds: new Phaser.Geom.Rectangle(left, top, T, T + h * LH) });
    }

    for (const entity of Object.values(state.entities)) {
      // Invisible interactables (a door is drawn by its tile; the entity only holds the script).
      if (entity.spriteId === 'none') continue;
      const art = this.manifest.sprites[entity.spriteId];
      // Scenery drawn from the pack's props (a well, a gallows, a tapestry on the wall).
      const propArt = !art ? this.manifest.props?.[entity.spriteId] : undefined;
      if (propArt) {
        const tile = tileAt(map, entity.position)!;
        const c = this.grid.tileCentre(entity.position.x, entity.position.y, tile.height);
        const y = propArt.anchor === 'wall' ? c.y - T * 0.6 : propArt.anchor === 'floor' ? c.y + T / 2 : c.y;
        const sprite = this.add.sprite(c.x, y, imageKey(propArt.url)).setOrigin(0.5, propArt.anchor === 'floor' ? 1 : 0.5).setDepth(this.grid.depth(entity.position.y, tile.height, 5));
        sprite.play(`prop:${entity.spriteId}`);
        this.sprites.set(entity.id, sprite);
        continue;
      }
      if (!art) {
        this.addPlaceholderEntity(entity.id, entity.spriteId, entity.position, map);
        continue;
      }
      const tile = tileAt(map, entity.position)!;
      const c = this.grid.tileCentre(entity.position.x, entity.position.y, tile.height);
      const depth = this.grid.depth(entity.position.y, tile.height, 5);
      // Under the feet: a ring by side (yours, allies, enemies, bystanders) when the art has one,
      // otherwise a soft contact shadow drawn by code so any art pack gets one.
      const ring = this.factionRing(entity, state);
      const ringArt = ring ? this.manifest.props?.[ring] : undefined;
      // A touch under full strength and slightly smaller than the tile: at close phone zoom a
      // full-size, full-opacity ring reads as a hard colour block under every creature on screen.
      const shadow = ringArt
        ? this.add.sprite(c.x, c.y, imageKey(ringArt.url)).setDepth(depth - 1).setAlpha(0.8).setScale(0.9).play(`prop:${ring}`)
        : this.add.ellipse(c.x, c.y, T * 0.7, T * 0.28, 0x000000, 0.35).setDepth(depth - 1);
      const sprite = this.add.sprite(c.x, c.y, imageKey(art.url)).setDepth(depth).setScale(this.baseScale(entity.spriteId));
      this.sprites.set(entity.id, sprite);
      this.shadows.set(entity.id, shadow);
      this.idle(entity.id, this.facing.get(entity.id) ?? 's');
      this.applyFate(entity.id, state);
    }

    const props = this.manifest.props ?? {};
    const torchProp = props.torch_wall ? 'torch_wall' : undefined;
    for (const p of this.propSprites) p.destroy();
    this.propSprites = [];
    for (const light of lightingOf(state).lights) {
      const propId = light.prop ?? torchProp;
      if (light.attachedTo || light.id.startsWith('surface:') || !light.position || !propId || !props[propId]) continue;
      const c = this.grid.tileCentre(light.position.x, light.position.y, tileAt(map, light.position)?.height ?? 0);
      const yOffset = props[propId]!.anchor === 'wall' ? -T * 0.6 : 0;
      const sprite = this.add.sprite(c.x, c.y + yOffset, imageKey(props[propId]!.url)).setDepth(this.grid.depth(light.position.y, 9, 6));
      sprite.play(`prop:${propId}`);
      this.propSprites.push(sprite);
    }
    this.lighting = new LightingLayer(this, map.width * T, map.height * T, T, LIGHTING_DEPTH, !torchProp);
    this.drawSurfaces(state);
  }

  override update(time: number): void {
    // Shadows follow their (possibly tweening) sprites; lights follow carriers and flicker.
    for (const [id, sprite] of this.sprites) {
      const shadow = this.shadows.get(id);
      shadow?.setPosition(sprite.x, sprite.y).setDepth(sprite.depth - 1);
    }
    this.lighting?.update(time, this.store.state, (light) => this.lightWorldPosition(light));
  }

  private lightWorldPosition(light: LightSource): Vec2 | null {
    if (light.attachedTo) {
      const sprite = this.sprites.get(light.attachedTo);
      return sprite ? { x: sprite.x, y: sprite.y - this.grid.tile * 0.5 } : null;
    }
    const p = lightPosition(this.store.state, light);
    if (!p) return null;
    const tile = tileAt(this.store.state.map, p);
    return this.grid.tileCentre(p.x, p.y, tile?.height ?? 0);
  }

  private animateMove(event: EntityMovedEvent, state: GameState, blocking = true): Promise<void> {
    const sprite = this.sprites.get(event.entityId);
    if (!sprite) return Promise.resolve();
    // A walk still in flight for this sprite is cut short (and settled) before the next starts.
    this.moveFinish.get(event.entityId)?.();
    this.tweens.killTweensOf(sprite);
    if (blocking) this.animating++;
    this.pathPreview.clear();
    this.stopBreathing(event.entityId);
    if (blocking) this.cameras.main.startFollow(sprite, true, 0.12, 0.12);
    const stepMs = state.turn.mode === 'combat' ? STEP_MS : EXPLORE_STEP_MS;

    let prev = event.from;
    const tweens = event.path.map((step) => {
      const from = prev;
      prev = step;
      const fromTile = tileAt(state.map, from)!;
      const tile = tileAt(state.map, step)!;
      const c = this.grid.tileCentre(step.x, step.y, tile.height);
      return {
        x: c.x,
        y: c.y,
        duration: stepMs,
        onStart: () => {
          // While crossing two tiles, draw in front of both.
          sprite.setDepth(Math.max(this.grid.depth(from.y, fromTile.height, 5), this.grid.depth(step.y, tile.height, 5)));
          this.walk(event.entityId, this.directionOf(from, step));
        },
        onComplete: () => sprite.setDepth(this.grid.depth(step.y, tile.height, 5)),
      };
    });
    return new Promise((resolve) => {
      // Settles exactly once: when the walk ends, when another walk replaces it, or by a
      // watchdog if the tween dies with its sprite (a rebuild mid-walk). Otherwise `busy`
      // would stay true and the game would stop taking input and AI turns for good.
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (blocking) this.animating--;
        if (this.moveFinish.get(event.entityId) === finish) this.moveFinish.delete(event.entityId);
        if (sprite.active) this.idle(event.entityId, this.facing.get(event.entityId) ?? 's');
        resolve();
      };
      this.moveFinish.set(event.entityId, finish);
      this.time.delayedCall(event.path.length * stepMs + 1000, finish);
      this.tweens.chain({ targets: sprite, tweens, onComplete: finish });
    });
  }

  // --- Event playback ------------------------------------------------------------

  /** True while events are animating; input and AI wait for it. */
  get busy(): boolean {
    return this.playing || this.animating > 0;
  }

  /** Plays queued engine events one after another, then resyncs every sprite with the state. */
  private async playQueue(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    this.pathPreview.clear();
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      try {
        // No single event may hold the game: an animation whose tween died (its sprite was
        // rebuilt mid-way) would otherwise leave input and AI waiting forever.
        const stuck = new Promise<'stuck'>((r) => setTimeout(() => r('stuck'), EVENT_WATCHDOG_MS));
        if ((await Promise.race([this.play(event), stuck])) === 'stuck') console.warn('event playback timed out', event.type);
      } catch (err) {
        console.error('event playback failed', event, err);
      }
    }
    this.playing = false;
    this.syncWithState(this.store.state);
    this.hooks.onIdle?.();
  }

  private centreOf(id: string): Vec2 | null {
    const s = this.sprites.get(id);
    return s ? { x: s.x, y: s.y } : null;
  }

  private async play(event: GameEvent): Promise<void> {
    const state = this.store.state;
    const e = event as GameEvent & Record<string, unknown>;
    const sprite = (id: unknown) => (typeof id === 'string' ? this.sprites.get(id) : undefined);
    const T = this.grid.tile;
    // Which event means "cast an ability" is configurable per game (AssetManifest.castEvent);
    // dnd5e's spellCast is the default. Not a `case` label since the type isn't a literal here.
    const castEvent = this.manifest.castEvent ?? DEFAULT_CAST_EVENT;
    if (event.type === castEvent.type) return this.playCastEvent(e, castEvent, state, T);
    switch (event.type) {
      case 'entityMoved': {
        const ev = event as EntityMovedEvent;
        // Exploring: companions catch up in the background; only the leader's walk holds input.
        if (state.turn.mode !== 'combat' && ev.entityId !== this.hooks.controlledEntityId()) {
          void this.animateMove(ev, state, false);
          return;
        }
        return this.animateMove(ev, state);
      }
      case 'entityTeleported': {
        const ev = event as EntityTeleportedEvent;
        const s = sprite(ev.entityId);
        if (!s) return;
        await tween(this, { targets: s, alpha: 0, duration: 150 });
        const c = this.grid.tileCentre(ev.to.x, ev.to.y, tileAt(state.map, ev.to)?.height ?? 0);
        s.setPosition(c.x, c.y);
        await tween(this, { targets: s, alpha: 1, duration: 150 });
        return;
      }
      case 'attackRolled': {
        const attackerId = String(e.attackerId);
        const attacker = sprite(attackerId);
        const target = this.centreOf(String(e.targetId));
        // A spellCast immediately followed by this attackRolled already played 'cast'.
        const skipAttackAnim = this.suppressNextAttackAnim;
        this.suppressNextAttackAnim = false;
        if (attacker && target) {
          this.face(attackerId, target.x < attacker.x ? 'w' : 'e');
          if (!skipAttackAnim) {
            const played = await this.playAction(attackerId, 'attack');
            if (!played) await this.juice.lunge(attacker, target);
            else this.idle(attackerId, this.facing.get(attackerId) ?? 's');
          }
        }
        if (target && !e.hit) await this.juice.floatText(target.x, target.y, this.texts.miss, '#b8b8b8');
        if (target && e.crit) {
          this.juice.shake(1.6);
          void this.juice.floatText(target.x, target.y - T * 0.4, this.texts.crit, '#ffd24a', 0.7);
          // '@critical' in manifest.fx is a hook, not an ability: the game's own crit flourish.
          const criticalFx = this.manifest.fx?.['@critical'];
          if (criticalFx) void this.playSpellEffect(criticalFx, attackerId, { entityId: String(e.targetId) });
          await this.juice.hitStop();
        }
        return;
      }
      case 'damageDealt': {
        const targetId = String(e.targetId);
        const s = sprite(targetId);
        if (!s) return;
        this.playProp('fx_hit_spark', s.x, s.y - T * 0.4, 2_000_000);
        if (['slashing', 'piercing', 'bludgeoning'].includes(String(e.damageType))) this.bloodDecal(s.x, s.y, s.depth);
        this.juice.burst(s.x, s.y, 0x8a1c14, e.crit ? 14 : 8);
        void this.juice.floatText(s.x, s.y, `-${e.amount}`, '#ff6a55', e.crit ? 0.8 : 0.6);
        const played = await this.playAction(targetId, 'hurt');
        if (played) this.idle(targetId, this.facing.get(targetId) ?? 's');
        else await this.juice.hit(s);
        return;
      }
      case 'healed': {
        const s = sprite(e.targetId);
        if (s && Number(e.amount) > 0) {
          this.playProp('fx_healing', s.x, s.y - T * 0.3, 2_000_000);
          this.juice.burst(s.x, s.y, 0x7fe08a, 6);
          await this.juice.floatText(s.x, s.y, `+${e.amount}`, '#8cf09a');
        }
        return;
      }
      case 'saveRolled': {
        const s = sprite(e.entityId);
        const roll = e.roll as { success: boolean } | undefined;
        if (s && roll) void this.juice.floatText(s.x, s.y - T * 0.3, roll.success ? this.texts.saved : this.texts.failed, roll.success ? '#c8d6ff' : '#ffb070', 0.45);
        return;
      }
      case 'reactionUsed': {
        const s = sprite(e.entityId);
        if (s && e.detail) await this.juice.floatText(s.x, s.y - T * 0.3, String(e.detail), '#ffe08a', 0.45);
        return;
      }
      case 'downed':
      case 'died':
      case 'revived':
      case 'stabilized': {
        const s = sprite(e.entityId);
        if (s && event.type === 'died') this.juice.burst(s.x, s.y, 0x5a0f0a, 16);
        if (s && event.type === 'downed') void this.juice.floatText(s.x, s.y, this.texts.downed, '#ff8a8a', 0.5);
        this.applyFate(String(e.entityId), state, true);
        return;
      }
      case 'mapChanged': {
        // A new place: rebuild everything and put the camera on the leader (not on a sprite
        // of the map we just left, which the camera might still be following).
        this.cameras.main.stopFollow();
        this.buildWorld(state);
        this.focusOn(this.hooks.controlledEntityId());
        const lead = this.sprites.get(this.hooks.controlledEntityId());
        if (lead) this.cameras.main.startFollow(lead, true, 0.12, 0.12);
        return;
      }
      case 'controllerChanged':
      case 'entitySpawned':
      case 'entityDespawned':
      case 'entityChanged':
      case 'tileChanged': {
        // A chest opens, a door swings, a lever flips: rebuild the world from state.
        this.buildWorld(state);
        return;
      }
      case 'trapSpotted':
      case 'trapTriggered':
      case 'trapDisarmed':
      case 'trapDisarmFailed': {
        this.drawSurfaces(state);
        const who = this.centreOf(String(e.entityId));
        const label = { trapSpotted: this.texts.trapSpotted, trapTriggered: this.texts.trapTriggered, trapDisarmed: this.texts.trapDisarmed, trapDisarmFailed: this.texts.trapDisarmFailed }[e.type];
        if (who && label) await this.juice.floatText(who.x, who.y, label, e.type === 'trapDisarmed' ? '#b8e09a' : '#e0a090');
        if (e.type === 'trapTriggered') this.juice.shake(1.2);
        return;
      }
      case 'surfaceChanged': {
        // Fire meeting water: a puff of steam where the puddle was.
        for (const change of (e.changes as { tile: Vec2; from: string | null; to: string | null }[]) ?? []) {
          if (change.from === 'water' && change.to === null) {
            const c = this.grid.tileCentre(change.tile.x, change.tile.y, tileAt(state.map, change.tile)?.height ?? 0);
            this.playProp('fx_steam', c.x, c.y, 1_900_000);
          }
        }
        this.drawSurfaces(state);
        return;
      }
      case 'entityPushed': {
        const s = sprite(e.entityId);
        const to = e.to as Vec2;
        if (!s) return;
        const c = this.grid.tileCentre(to.x, to.y, tileAt(state.map, to)?.height ?? 0);
        await tween(this, { targets: s, x: c.x, y: c.y, duration: 220, ease: 'Cubic.easeOut' });
        if (e.collidedWith) {
          this.juice.shake(0.6);
          this.playProp('fx_dust', s.x, s.y, s.depth + 1);
        }
        return;
      }
      case 'entityFell': {
        const s = sprite(e.entityId);
        this.juice.shake(1.2);
        if (s) {
          this.playProp('fx_dust', s.x, s.y, s.depth + 1);
          await this.juice.floatText(s.x, s.y, this.texts.fell ?? '¡Caída!', '#ffb070', 0.5);
        }
        return;
      }
      case 'slipped': {
        const s = sprite(e.entityId);
        if (s) await this.juice.floatText(s.x, s.y, this.texts.slipped ?? '¡Resbala!', '#c8e0ff', 0.45);
        return;
      }
      case 'exploded': {
        const at = e.at as Vec2;
        const c = this.grid.tileCentre(at.x, at.y, tileAt(state.map, at)?.height ?? 0);
        this.juice.shake(2);
        if (this.manifest.props?.fx_explosion) this.playProp('fx_explosion', c.x, c.y - T * 0.3, 2_000_000);
        else await this.juice.ring(c.x, c.y, 1.6, 0xff7a2a);
        this.juice.burst(c.x, c.y, 0xffa040, 18);
        await this.juice.hitStop();
        return;
      }
      case 'combatStarted':
        // Bystanders pulled into the fight change rings.
        this.refreshRings(state);
        // Show who you're up against before the first turn takes the camera elsewhere.
        const foes = this.markFoes(state);
        if (foes.length) {
          this.cameras.main.stopFollow();
          const cx = foes.reduce((a, f) => a + f.x, 0) / foes.length;
          const cy = foes.reduce((a, f) => a + f.y, 0) / foes.length;
          this.cameras.main.pan(cx, cy, 350, 'Sine.easeInOut');
        }
        await this.juice.banner(this.texts.combatStart);
        return;
      case 'combatEnded': {
        this.refreshRings(state);
        const won = e.winner && Object.values(state.entities).some((x) => x.factionId === e.winner && x.controllerId.startsWith('player'));
        await this.juice.banner(won ? this.texts.victory : this.texts.defeat, won ? '#e8d6b0' : '#ff7a6a');
        return;
      }
      case 'turnStarted': {
        const s = sprite(e.entityId);
        if (s) {
          this.cameras.main.stopFollow();
          this.cameras.main.pan(s.x, s.y, 250, 'Sine.easeInOut');
        }
        return;
      }
      default:
        return;
    }
  }

  /** Dead and fallen creatures lie down; the dead fade into the floor. */
  private applyFate(id: string, state: GameState, animate = false): void {
    const s = this.sprites.get(id);
    const e = state.entities[id];
    if (!s || !e) return;
    const dead = hasCondition(e, 'dead');
    const down = hasCondition(e, 'downed');
    if (e.tags.includes('object')) {
      // Scenery breaks rather than lying down: debris if the art has it, gone otherwise.
      const art = this.manifest.sprites[e.spriteId];
      this.shadows.get(id)?.setVisible(false);
      if (dead && art?.kind === 'frames' && art.animations.broken) {
        s.stop().setFrame(`${e.spriteId}:broken-0`).setVisible(true);
        s.setDepth(this.grid.depth(e.position.y, tileAt(state.map, e.position)?.height ?? 0, 1.8));
      } else {
        s.setVisible(!dead);
      }
      return;
    }
    const angle = dead || down ? 90 : 0;
    const alpha = dead ? 0.55 : 1;
    if (dead) s.setTint(0x6a6a6a);
    else if (down) s.setTint(0xc08080);
    else s.clearTint();
    if (dead || down) {
      s.stop();
      this.stopBreathing(id);
    } else if (s.angle !== 0) {
      this.idle(id, this.facing.get(id) ?? 's');
    }
    this.shadows.get(id)?.setVisible(!dead);
    if (animate) this.tweens.add({ targets: s, angle, alpha, duration: 300 });
    else s.setAngle(angle).setAlpha(alpha);
    if (dead) s.setDepth(s.depth - 4);
  }

  /** Safety net after playback: every sprite where the state says it is. */
  private syncWithState(state: GameState): void {
    for (const [id, s] of this.sprites) {
      const e = state.entities[id];
      if (!e) continue;
      const c = this.grid.tileCentre(e.position.x, e.position.y, tileAt(state.map, e.position)?.height ?? 0);
      s.setPosition(c.x, c.y);
      if (!hasCondition(e, 'dead')) s.setDepth(this.grid.depth(e.position.y, tileAt(state.map, e.position)?.height ?? 0, 5));
      this.applyFate(id, state);
    }
    this.updateActiveRing();
  }

  // --- Surfaces -------------------------------------------------------------------

  private defineSurfaceAnims(): void {
    for (const [id, art] of Object.entries(this.manifest.surfaces ?? {})) {
      const texture = this.textures.get(imageKey(art.url));
      art.frames.forEach((r, f) => texture.add(`surface:${id}-${f}`, 0, r.x, r.y, r.w, r.h));
      if (this.anims.exists(`surface:${id}`)) continue;
      this.anims.create({
        key: `surface:${id}`,
        frames: art.frames.map((_, f) => ({ key: imageKey(art.url), frame: `surface:${id}-${f}` })),
        frameRate: art.fps,
        repeat: art.loop ? -1 : 0,
      });
    }
  }

  /**
   * Soft edges between terrains (scrub spilling onto the road): a higher-priority neighbour
   * at the same height draws its fringe over this tile, from its own tileset. No blending
   * across height changes (faces and rims handle those).
   */
  private drawFringes(map: GameState['map'], pos: Vec2, tile: Tile, c: { x: number; y: number }, depth: number): void {
    const terrain = this.manifest.terrain;
    // Only terrains that take part in blending receive fringes (no scrub creeping onto dungeon stone).
    const own = terrain[tile.terrain]?.blend;
    if (!own) return;
    const mine = own.priority;
    const at = (dx: number, dy: number) => tileAt(map, { x: pos.x + dx, y: pos.y + dy });
    const fringes: { priority: number; tileset: string; frame: number }[] = [];
    const consider = (dir: 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw', dx: number, dy: number) => {
      const other = at(dx, dy);
      if (!other || other.terrain === tile.terrain || other.height !== tile.height) return;
      const art = terrain[other.terrain];
      const blend = art?.blend;
      if (!blend || blend.priority <= mine) return;
      // Corners only where neither side already shows that terrain's edge.
      if (dir.length === 2 && (at(dx, 0)?.terrain === other.terrain || at(0, dy)?.terrain === other.terrain)) return;
      const frame = blend.edges[dir];
      if (frame !== undefined) fringes.push({ priority: blend.priority, tileset: art.tileset, frame });
    };
    consider('n', 0, -1);
    consider('e', 1, 0);
    consider('s', 0, 1);
    consider('w', -1, 0);
    consider('ne', 1, -1);
    consider('nw', -1, -1);
    consider('se', 1, 1);
    consider('sw', -1, 1);
    fringes.sort((a, b) => a.priority - b.priority);
    fringes.forEach((f, i) => this.worldObjects.push(this.add.image(c.x, c.y, tilesetKey(f.tileset), f.frame).setDepth(depth + 1.1 + i * 0.01)));
  }

  /**
   * Redraws the surface layer from state: the art pack's animated tiles when it has them,
   * otherwise translucent colour patches (the ruleset's hint colour) so nothing is invisible.
   */
  private drawSurfaces(state: GameState): void {
    for (const o of this.surfaceObjects) o.destroy();
    this.surfaceObjects = [];
    const defs = this.store.engine.ruleset.surfaces ?? {};
    const T = this.grid.tile;
    for (const [key, surface] of Object.entries(surfacesOf(state))) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      const h = tileAt(state.map, { x, y })?.height ?? 0;
      const c = this.grid.tileCentre(x, y, h);
      const depth = this.grid.depth(y, h, 1.5);
      const art = this.manifest.surfaces?.[surface.type];
      if (art) {
        const sprite = this.add.sprite(c.x, c.y, imageKey(art.url)).setDepth(depth);
        const hash = variantHash(x, y);
        if (art.frames.length > 1 && art.fps > 0) sprite.play({ key: `surface:${surface.type}`, startFrame: hash % art.frames.length });
        else sprite.setFrame(`surface:${surface.type}-0`).setFlip((hash & 1) === 1, (hash & 2) === 2);
        this.surfaceObjects.push(sprite);
        continue;
      }
      const color = Phaser.Display.Color.HexStringToColor(defs[surface.type]?.color ?? '#888888').color;
      const patch = this.add.rectangle(c.x, c.y, T - 2, T - 2, color, surface.type === 'fire' || surface.type === 'electrified' ? 0.55 : 0.45).setDepth(depth);
      if (surface.type === 'fire' || surface.type === 'electrified') {
        patch.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: patch, alpha: { from: 0.35, to: 0.75 }, duration: 160 + ((x + y) % 4) * 40, yoyo: true, repeat: -1 });
      }
      this.surfaceObjects.push(patch);
    }
    // Known traps: a red frame with spikes while armed, greyed once disarmed or sprung.
    for (const trap of trapsOf(state)) {
      if (trap.hidden) continue;
      for (const t of trap.tiles) {
        const h = tileAt(state.map, t)?.height ?? 0;
        const c = this.grid.tileCentre(t.x, t.y, h);
        const propId = trap.armed ? 'trap_armed' : 'trap_disarmed';
        const prop = this.manifest.props?.[propId];
        if (prop) {
          const sprite = this.add.sprite(c.x, c.y + T / 2, imageKey(prop.url)).setOrigin(0.5, 1).setDepth(this.grid.depth(t.y, h, 1.6));
          sprite.play(`prop:${propId}`);
          this.surfaceObjects.push(sprite);
          continue;
        }
        const g = this.add.graphics().setDepth(this.grid.depth(t.y, h, 1.6));
        const color = trap.armed ? 0xd0402a : 0x6a6266;
        const s = T * 0.36;
        g.lineStyle(1, color, trap.armed ? 0.95 : 0.6).strokeRect(c.x - s, c.y - s, s * 2, s * 2);
        for (let i = -1; i <= 1; i++) g.fillStyle(color, trap.armed ? 0.9 : 0.5).fillTriangle(c.x + i * s * 0.6 - 2, c.y + s * 0.4, c.x + i * s * 0.6 + 2, c.y + s * 0.4, c.x + i * s * 0.6, c.y - s * 0.4);
        if (trap.armed) this.tweens.add({ targets: g, alpha: { from: 0.55, to: 1 }, duration: 600, yoyo: true, repeat: -1 });
        this.surfaceObjects.push(g);
      }
    }
  }

  /** Re-dress the foot rings after sides change (no full rebuild). */
  private refreshRings(state: GameState): void {
    for (const [id, old] of this.shadows) {
      const e = state.entities[id];
      const ring = e ? this.factionRing(e, state) : null;
      const art = ring ? this.manifest.props?.[ring] : undefined;
      if (!art || !(old instanceof Phaser.GameObjects.Sprite)) continue;
      old.play(`prop:${ring}`);
    }
  }

  /** Which foot ring an entity wears, seen from the side of the character the player controls. */
  /** Fight starts: every foe flashes red with a "!" over the head, so nobody wonders who's who. */
  private markFoes(state: GameState): Vec2[] {
    const me = state.entities[this.hooks.controlledEntityId()];
    const at: Vec2[] = [];
    if (!me) return at;
    for (const id of state.turn.order) {
      const foe = state.entities[id];
      const s = this.sprites.get(id);
      if (!foe || !s || !isHostile(me, foe)) continue;
      at.push({ x: s.x, y: s.y });
      s.setTint(0xff5040);
      this.time.delayedCall(1400, () => s.active && s.clearTint());
      const mark = this.add
        .text(s.x, s.y - this.grid.tile * 1.1, '!', { fontFamily: 'VT323, monospace', fontSize: `${Math.round(this.grid.tile * 0.7)}px`, color: '#ff5a40', stroke: '#000', strokeThickness: Math.max(2, Math.round(this.grid.tile / 8)) })
        .setOrigin(0.5, 1)
        .setResolution(4)
        .setDepth(2_000_000);
      this.tweens.add({ targets: mark, y: mark.y - 10, alpha: 0, delay: 1400, duration: 500, onComplete: () => mark.destroy() });
    }
    return at;
  }

  private factionRing(entity: Entity, state: GameState): string | null {
    const me = state.entities[this.hooks.controlledEntityId()];
    if (!me || entity.tags.includes('object')) return null;
    if (entity.controllerId === me.controllerId) return 'marker_party';
    if (entity.tags.includes('noncombatant')) return 'marker_neutral';
    // Mid-fight, whoever isn't in it is scenery (the guards watching don't look like foes).
    if (state.turn.mode === 'combat' && !state.turn.order.includes(entity.id)) return 'marker_neutral';
    return isHostile(me, entity) ? 'marker_enemy' : 'marker_ally';
  }

  /** Simple code-drawn stand-ins for entities whose art isn't in the pack yet (barrels, crates). */
  private addPlaceholderEntity(id: string, spriteId: string, position: Vec2, map: GameState['map']): void {
    const key = `placeholder:${spriteId}`;
    const T = this.grid.tile;
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({}, false);
      const w = T * 0.8;
      if (spriteId.startsWith('barrel')) {
        g.fillStyle(spriteId === 'barrel_oil' ? 0x3a2a1a : 0x6a4a2a).fillRoundedRect(0, 0, w, w * 1.1, 3);
        g.fillStyle(0x2a2a2a).fillRect(0, w * 0.25, w, 2).fillRect(0, w * 0.8, w, 2);
        if (spriteId === 'barrel_oil') g.fillStyle(0xb02a1a).fillTriangle(w / 2, w * 0.4, w * 0.3, w * 0.7, w * 0.7, w * 0.7);
      } else {
        g.fillStyle(0x7a5a32).fillRect(0, 0, w, w).lineStyle(1, 0x3a2a16).strokeRect(0, 0, w, w).lineBetween(0, 0, w, w).lineBetween(w, 0, 0, w);
      }
      g.generateTexture(key, Math.ceil(w) + 1, Math.ceil(w * 1.1) + 1);
      g.destroy();
    }
    const h = tileAt(map, position)?.height ?? 0;
    const c = this.grid.tileCentre(position.x, position.y, h);
    const sprite = this.add.sprite(c.x, c.y + T * 0.35, key).setOrigin(0.5, 1).setDepth(this.grid.depth(position.y, h, 5));
    this.sprites.set(id, sprite);
  }

  // --- Props and decals ------------------------------------------------------------

  private defineProps(): void {
    for (const [id, prop] of Object.entries(this.manifest.props ?? {})) {
      const texture = this.textures.get(imageKey(prop.url));
      prop.frames.forEach((r, f) => {
        const frame = texture.add(`prop:${id}-${f}`, 0, r.x, r.y, r.w, r.h);
        if (frame && prop.anchor === 'floor') {
          frame.customPivot = true;
          frame.pivotX = 0.5;
          frame.pivotY = (r.h - 1) / r.h;
        }
      });
      if (this.anims.exists(`prop:${id}`)) continue;
      this.anims.create({
        key: `prop:${id}`,
        frames: prop.frames.map((_, f) => ({ key: imageKey(prop.url), frame: `prop:${id}-${f}` })),
        frameRate: prop.fps,
        repeat: prop.loop ? -1 : 0,
      });
    }
  }

  /** One-shot animated effect (hit spark, dust) that removes itself. */
  private playProp(id: string, x: number, y: number, depth: number): void {
    const prop = this.manifest.props?.[id];
    if (!prop) return;
    const s = this.add.sprite(x, y, imageKey(prop.url)).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    s.play(`prop:${id}`);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  /** Same art as `playProp`, but doesn't auto-destroy — for a prop whose animation loops
   * (a projectile in flight, a ray, a held buff glow) and whose lifetime the caller manages. */
  private spawnProp(id: string, x: number, y: number, depth: number): Phaser.GameObjects.Sprite | null {
    const prop = this.manifest.props?.[id];
    if (!prop) return null;
    const s = this.add.sprite(x, y, imageKey(prop.url)).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    s.play(`prop:${id}`);
    return s;
  }

  // --- Spell VFX (docs/ART_CATALOG.md "Efectos de conjuros y habilidades") -----------

  /** A sprite flies from `from` to `to`, rotated to the travel angle; an impact plays on arrival. */
  private async playProjectile(fxId: string, impactFxId: string | undefined, from: Vec2, to: Vec2, tilesPerSec = 12): Promise<void> {
    const s = this.spawnProp(fxId, from.x, from.y, 2_050_000);
    if (!s) return;
    const dist = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const duration = Math.max(80, (dist / this.grid.tile / tilesPerSec) * 1000);
    s.setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));
    await tween(this, { targets: s, x: to.x, y: to.y, duration, ease: 'Linear' });
    s.destroy();
    if (impactFxId) this.playProp(impactFxId, to.x, to.y, 2_050_000);
  }

  /** A beam stretched along the caster-target line for a fixed time, so one sprite covers any range. */
  private async playRay(fxId: string, from: Vec2, to: Vec2, durationMs: number): Promise<void> {
    const prop = this.manifest.props?.[fxId];
    if (!prop) return;
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const dist = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const s = this.spawnProp(fxId, mid.x, mid.y, 2_050_000);
    if (!s) return;
    s.setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));
    s.setScale(Math.max(1, dist / (prop.frames[0]?.w ?? dist)), 1);
    await wait(this, durationMs);
    s.destroy();
  }

  /** One flare per tile, staggered by distance from the caster (a cone or line sweeping outward). */
  private async playCone(fxId: string, casterPos: Vec2, tiles: Vec2[], delayPerTileMs: number): Promise<void> {
    const state = this.store.state;
    // Mobile perf: a cone/line is a handful of tiles already, but cap it just in case content grows.
    const capped = tiles.slice(0, 24);
    await Promise.all(
      capped.map((t) => {
        const c = this.grid.tileCentre(t.x, t.y, tileAt(state.map, t)?.height ?? 0);
        const dist = Math.hypot(t.x - casterPos.x, t.y - casterPos.y);
        return wait(this, dist * delayPerTileMs).then(() => this.playProp(fxId, c.x, c.y, 2_050_000));
      }),
    );
  }

  /**
   * Plays one engine event that casts an ability (dnd5e's `spellCast` by default — see
   * `AssetManifest.castEvent`): the caster's 'cast' animation (if its art has one), then
   * its `manifest.fx` entry (if any), falling back to the original generic ring flourish.
   */
  private async playCastEvent(e: GameEvent & Record<string, unknown>, cfg: NonNullable<AssetManifest['castEvent']>, state: GameState, T: number): Promise<void> {
    const casterId = String(e[cfg.casterField]);
    const abilityId = String(e[cfg.idField]);
    const target = (e[cfg.targetField] as { entityId?: string; tile?: Vec2 } | undefined) ?? {};
    const tiles = cfg.tilesField ? (e[cfg.tilesField] as Vec2[] | undefined) : undefined;
    // If the very next queued event is this ability's own attack roll, its 'attack'
    // animation would be redundant with the 'cast' we're about to play.
    if (this.queue[0]?.type === 'attackRolled') this.suppressNextAttackAnim = true;

    if (target.tile) {
      const casterPos = state.entities[casterId]?.position;
      if (casterPos) this.face(casterId, target.tile.x < casterPos.x ? 'w' : 'e');
    }
    const hasCastAnim = this.art(casterId)?.kind === 'frames' && !!this.art(casterId)?.animations.cast;
    if (hasCastAnim) {
      void this.playAction(casterId, 'cast');
      await wait(this, 350); // ~frame 3 of 4 at 8fps: the glow is released, so the fx reads as cast by the hand
    }

    const fx = this.manifest.fx?.[abilityId];
    if (fx) {
      await this.playSpellEffect(fx, casterId, target, tiles);
    } else {
      // No entry in manifest.fx: the original, generic ring-at-caster-then-target flourish.
      const caster = this.centreOf(casterId);
      if (caster) await this.juice.ring(caster.x, caster.y - T * 0.4, 0.6, 0x9ad0ff);
      const at = target.tile
        ? this.grid.tileCentre(target.tile.x, target.tile.y, tileAt(state.map, target.tile)?.height ?? 0)
        : target.entityId
          ? this.centreOf(target.entityId)
          : null;
      if (at && caster && (at.x !== caster.x || at.y !== caster.y)) await this.juice.ring(at.x, at.y, target.tile ? 2.5 : 0.8, 0xffa060);
    }

    if (hasCastAnim) this.idle(casterId, this.facing.get(casterId) ?? 's');
  }

  /** Plays one `manifest.fx` entry, resolving once its main visual is done. */
  private async playSpellEffect(cfg: SpellFx, casterId: string, target: { entityId?: string; tile?: Vec2 }, tiles?: Vec2[]): Promise<void> {
    const from = this.centreOf(casterId);
    if (!from) return;
    const state = this.store.state;
    const to = target.entityId
      ? this.centreOf(target.entityId)
      : target.tile
        ? this.grid.tileCentre(target.tile.x, target.tile.y, tileAt(state.map, target.tile)?.height ?? 0)
        : null;

    switch (cfg.kind) {
      case 'projectile': {
        if (!to) return;
        const count = cfg.count ?? 1;
        await Promise.all(
          Array.from({ length: count }, (_, i) => wait(this, i * (cfg.staggerMs ?? 0)).then(() => this.playProjectile(cfg.fx, cfg.impactFx, from, to, cfg.tilesPerSec))),
        );
        return;
      }
      case 'ray': {
        if (!to) return;
        await this.playRay(cfg.fx, from, to, cfg.durationMs ?? 400);
        if (cfg.impactFx) this.playProp(cfg.impactFx, to.x, to.y, 2_050_000);
        return;
      }
      case 'instant': {
        const at = to ?? from;
        const def = this.manifest.props?.[cfg.fx];
        if (def?.loop) {
          // A looping texture used as a single flash: hold it briefly, then remove it by hand.
          const s = this.spawnProp(cfg.fx, at.x, at.y, 2_050_000);
          await wait(this, 1200);
          s?.destroy();
        } else {
          this.playProp(cfg.fx, at.x, at.y, 2_050_000);
        }
        return;
      }
      case 'cone': {
        if (!tiles?.length) return;
        const casterPos = state.entities[casterId]?.position;
        if (!casterPos) return;
        await this.playCone(cfg.fx, casterPos, tiles, cfg.delayPerTileMs ?? 40);
        return;
      }
      case 'burst': {
        if (!to) return;
        await this.playProjectile(cfg.beadFx, undefined, from, to, cfg.tilesPerSec);
        this.playProp(cfg.fx, to.x, to.y, 2_050_000);
        this.juice.shake(1.6);
        return;
      }
      case 'ring': {
        this.playProp(cfg.fx, from.x, from.y, 2_050_000);
        if (cfg.extraFx) this.playProp(cfg.extraFx, from.x, from.y, 2_060_000);
        this.juice.shake(1);
        return;
      }
    }
  }

  /** Blood stays on the floor for a while after a hit, then fades. */
  private bloodDecal(x: number, y: number, depthAbove: number): void {
    const props = this.manifest.props ?? {};
    const ids = Object.keys(props).filter((k) => k.startsWith('blood_'));
    if (ids.length === 0) return;
    const id = ids[Math.floor(Math.random() * ids.length)]!;
    const prop = props[id]!;
    const decal = this.add
      .image(x + (Math.random() - 0.5) * this.grid.tile * 0.4, y + this.grid.tile * 0.1, imageKey(prop.url), `prop:${id}-0`)
      .setDepth(depthAbove - 4)
      .setAlpha(0.85);
    this.worldObjects.push(decal);
    this.tweens.add({ targets: decal, alpha: 0, delay: 25_000, duration: 4_000, onComplete: () => decal.destroy() });
  }

  // --- Overlays (driven by the controller) -----------------------------------------

  /** Marks the creature whose turn it is with a ring at its feet. */
  setActive(entityId: string | null): void {
    this.activeId = entityId;
    this.updateActiveRing();
  }

  private updateActiveRing(): void {
    const s = this.activeId ? this.sprites.get(this.activeId) : undefined;
    if (!s) {
      this.activeRing?.setVisible(false);
      return;
    }
    const T = this.grid.tile;
    if (!this.activeRing) {
      this.activeRing = this.add.ellipse(0, 0, T * 0.9, T * 0.4).setStrokeStyle(1, 0xe8c070, 0.9).setFillStyle(0xe8c070, 0.12);
      this.tweens.add({ targets: this.activeRing, alpha: { from: 1, to: 0.4 }, duration: 600, yoyo: true, repeat: -1 });
    }
    this.activeRing.setVisible(true).setPosition(s.x, s.y).setDepth(s.depth - 2);
  }

  /** Tiles the active creature can reach this turn, and creatures/tiles that are valid targets. */
  setOverlays(moveTiles: Vec2[], targetIds: string[], areaTiles: Vec2[] = [], pickedIds: string[] = []): void {
    const g = this.overlay.clear();
    const T = this.grid.tile;
    const state = this.store.state;
    for (const p of moveTiles) {
      const c = this.grid.tileCentre(p.x, p.y, tileAt(state.map, p)?.height ?? 0);
      g.fillStyle(0x9fc8ff, 0.13).fillRect(c.x - T / 2 + 1, c.y - T / 2 + 1, T - 2, T - 2);
    }
    for (const p of areaTiles) {
      const c = this.grid.tileCentre(p.x, p.y, tileAt(state.map, p)?.height ?? 0);
      g.fillStyle(0xff8a40, 0.25).fillRect(c.x - T / 2, c.y - T / 2, T, T);
    }
    for (const id of targetIds) {
      const s = this.sprites.get(id);
      if (s) g.lineStyle(1, 0xff5040, 0.9).strokeRect(s.x - T / 2 + 1, s.y - T + 1, T - 2, T - 2);
    }
    // Picked creatures (multi-target spells): filled marker, one notch per repeated pick.
    pickedIds.forEach((id, i) => {
      const s = this.sprites.get(id);
      if (!s) return;
      const repeats = pickedIds.slice(0, i).filter((p) => p === id).length;
      g.fillStyle(0xe8c070, 0.35).fillRect(s.x - T / 2 + 1, s.y - T + 1, T - 2, T - 2);
      g.fillStyle(0xe8c070, 1).fillRect(s.x - T / 2 + 2 + repeats * 4, s.y - T - 3, 3, 3);
    });
  }


  /** Characters face 4 directions: the dominant axis of the step (horizontal on exact diagonals). */
  private directionOf(from: Vec2, to: Vec2): Dir {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
    return dy > 0 ? 's' : 'n';
  }

  private focusOn(entityId: string): void {
    const sprite = this.sprites.get(entityId);
    if (sprite) this.cameras.main.centerOn(sprite.x, sprite.y);
  }

  // --- Character animation ---------------------------------------------------

  private art(entityId: string): SpriteArt | undefined {
    return this.manifest.sprites[this.store.state.entities[entityId]?.spriteId ?? ''];
  }

  private spriteIdOf(entityId: string): string {
    return this.store.state.entities[entityId]?.spriteId ?? '';
  }

  /**
   * Slices each sprite's animations into named frames with a pivot at the feet, so
   * frames of different sizes (64px LPC body, 128/192px weapon swings, 16x28 0x72
   * knights) all stand on the tile centre.
   */
  private defineCharacterFrames(): void {
    for (const [id, art] of Object.entries(this.manifest.sprites)) {
      const texture = this.textures.get(imageKey(art.url));
      if (art.kind === 'lpc') {
        for (const [name, a] of Object.entries(art.animations)) {
          const dirs: Dir[] = a.rows === 4 ? DIR_ROWS : ['s'];
          dirs.forEach((dir, row) => {
            for (let f = 0; f < a.frames; f++) {
              const frame = texture.add(`${id}:${name}-${dir}-${f}`, 0, f * a.frameSize, a.y + row * a.frameSize, a.frameSize, a.frameSize);
              if (!frame) continue;
              frame.customPivot = true;
              frame.pivotX = 0.5;
              frame.pivotY = ((a.frameSize - LPC_BASE) / 2 + LPC_FEET_Y) / a.frameSize;
            }
          });
          this.createLpcAnimations(id, name, a);
        }
      } else {
        for (const [name, rects] of Object.entries(art.animations)) {
          rects.forEach((r, f) => {
            const frame = texture.add(`${id}:${name}-${f}`, 0, r.x, r.y, r.w, r.h);
            if (!frame) return;
            frame.customPivot = true;
            frame.pivotX = 0.5;
            frame.pivotY = (r.h - 1) / r.h;
          });
          const key = `${id}:${name}`;
          if (this.anims.exists(key)) continue;
          // Action anims (actions.json) have their own pace: attack ~10fps, hurt ~12fps, cast stays at 8fps.
          const frameRate = name === 'attack' ? 10 : name === 'hurt' ? 12 : 8;
          this.anims.create({
            key,
            frames: rects.map((_, f) => ({ key: imageKey(art.url), frame: `${id}:${name}-${f}` })),
            frameRate,
            repeat: name === 'idle' || name === 'move' ? -1 : 0,
          });
        }
      }
    }
  }

  private createLpcAnimations(id: string, name: string, a: LpcAnimation): void {
    const art = this.manifest.sprites[id]!;
    const dirs: Dir[] = a.rows === 4 ? DIR_ROWS : ['s'];
    for (const dir of dirs) {
      // The walk cycle's frame 0 is the standing pose; the loop uses 1-8.
      const first = name === 'walk' ? 1 : 0;
      const frames = Array.from({ length: a.frames - first }, (_, i) => ({ key: imageKey(art.url), frame: `${id}:${name}-${dir}-${i + first}` }));
      const animKey = `${id}:${name}-${dir}`;
      if (this.anims.exists(animKey)) continue;
      this.anims.create({
        key: animKey,
        frames,
        frameRate: name === 'idle' ? 2 : 10,
        repeat: name === 'walk' || name === 'idle' ? -1 : 0,
      });
    }
  }

  /** Applies facing: 4-direction art picks a row, 2-direction art flips horizontally. */
  private face(entityId: string, dir: Dir): void {
    const previous = this.facing.get(entityId) ?? 's';
    const art = this.art(entityId);
    const sprite = this.sprites.get(entityId);
    if (art?.kind === 'frames') {
      // Moving purely up or down keeps the previous left/right facing.
      const horizontal = dir === 'w' || dir === 'e' ? dir : previous === 'w' ? 'w' : 'e';
      this.facing.set(entityId, horizontal);
      sprite?.setFlipX((horizontal === 'w') !== (art.facing === 'left'));
    } else {
      this.facing.set(entityId, dir);
    }
  }

  private walk(entityId: string, dir: Dir): void {
    this.face(entityId, dir);
    const sprite = this.sprites.get(entityId);
    const art = this.art(entityId);
    if (!sprite || !art) return;
    const id = this.spriteIdOf(entityId);
    if (art.kind === 'frames') {
      if (art.animations.move) sprite.play(`${id}:move`, true);
    } else if (art.animations.walk) {
      sprite.play(`${id}:walk-${this.facing.get(entityId)}`, true);
    }
  }

  /**
   * Idle: the art's own idle animation when it has one; otherwise the standing frame
   * with a slow "breathing" squash so characters never look frozen.
   */
  private idle(entityId: string, dir: Dir): void {
    this.face(entityId, dir);
    const sprite = this.sprites.get(entityId);
    const art = this.art(entityId);
    if (!sprite || !art) return;
    const id = this.spriteIdOf(entityId);
    const facing = this.facing.get(entityId)!;
    if (art.kind === 'frames') {
      // Objects show their state through a "pose:<animation>" tag (pose:open, pose:down...).
      const pose = this.store.state.entities[entityId]?.tags.find((t) => t.startsWith('pose:'))?.slice(5);
      sprite.play(pose && art.animations[pose] ? `${id}:${pose}` : `${id}:idle`, true);
      return;
    }
    if (art.animations.idle) {
      sprite.play(`${id}:idle-${facing}`, true);
      return;
    }
    sprite.stop().setFrame(`${id}:walk-${facing}-0`);
    this.stopBreathing(entityId);
    this.breathing.set(
      entityId,
      this.tweens.add({ targets: sprite, scaleY: this.baseScale(this.spriteIdOf(entityId)) * 1.025, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
    );
  }

  /**
   * Plays a non-looping action animation ('attack', 'cast' or 'hurt' — content/<game>/art/
   * <preset>/actions.json) and resolves once it finishes. Resolves `false` immediately, without
   * playing anything, when this sprite doesn't have that animation (older packs, LPC art):
   * the caller falls back to its own code-driven effect.
   */
  private playAction(entityId: string, name: 'attack' | 'cast' | 'hurt'): Promise<boolean> {
    const art = this.art(entityId);
    const s = this.sprites.get(entityId);
    if (!s || !art || art.kind !== 'frames' || !art.animations[name]) return Promise.resolve(false);
    const id = this.spriteIdOf(entityId);
    return new Promise((resolve) => {
      s.play(`${id}:${name}`, true);
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => resolve(true));
    });
  }

  private stopBreathing(entityId: string): void {
    this.breathing.get(entityId)?.remove();
    this.breathing.delete(entityId);
    this.sprites.get(entityId)?.setScale(this.baseScale(this.spriteIdOf(entityId)));
  }

  private baseScale(spriteId: string): number {
    const art = this.manifest.sprites[spriteId];
    return art?.kind === 'frames' ? (art.scale ?? 1) : 1;
  }

  // --- Input -------------------------------------------------------------

  private setupInput(): void {
    this.input.addPointer(1);
    const cam = this.cameras.main;

    // A gesture lasts from the first finger down to the last finger up. It only counts as a tap
    // (move order) if it stayed a single, still pointer the whole time: pinches and drags never move.
    const downPointers = () => this.input.manager.pointers.filter((ptr) => ptr.isDown);
    let gestureIsTap = false;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const down = downPointers();
      if (down.length === 1) {
        gestureIsTap = true;
        this.dragStart = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        this.dragging = false;
      } else {
        // Second finger: this gesture is now a pinch.
        gestureIsTap = false;
        this.dragStart = null;
        this.pinchDistance = null;
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const down = downPointers();
      if (down.length >= 2) {
        // Pinch zoom on touch screens.
        const [a, b] = down as [Phaser.Input.Pointer, Phaser.Input.Pointer];
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (this.pinchDistance) cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dist / this.pinchDistance), MIN_TILE_PX / this.grid.tile, MAX_TILE_PX / this.grid.tile));
        this.pinchDistance = dist;
        return;
      }
      this.pinchDistance = null;

      if (p.isDown) {
        // After a pinch, the remaining finger restarts the pan from where it is (no jump).
        this.dragStart ??= { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        const dx = p.x - this.dragStart.x;
        const dy = p.y - this.dragStart.y;
        if (this.dragging || Math.hypot(dx, dy) > TAP_SLOP) {
          this.dragging = true;
          gestureIsTap = false;
          cam.stopFollow();
          cam.setScroll(this.dragStart.scrollX - dx / cam.zoom, this.dragStart.scrollY - dy / cam.zoom);
        }
        return;
      }
      const tile = this.pickTile(p.worldX, p.worldY);
      this.hooks.onTileHovered(tile);
      if (!p.wasTouch) this.drawPathPreview(tile);
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.pinchDistance = null;
      if (downPointers().length > 0) {
        // One finger of a pinch lifted; the other may keep panning.
        this.dragStart = null;
        return;
      }
      const isTap = gestureIsTap;
      gestureIsTap = false;
      this.dragStart = null;
      this.dragging = false;
      if (!isTap || this.busy) return;
      const entityId = this.pickEntity(p.worldX, p.worldY);
      const tile = entityId ? this.store.state.entities[entityId]!.position : this.pickTile(p.worldX, p.worldY);
      if (tile) this.hooks.onTileSelected(tile, entityId ?? undefined);
    });

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), MIN_TILE_PX / this.grid.tile, MAX_TILE_PX / this.grid.tile));
    });
  }

  /** Front-most living creature or object whose sprite (opaque box) is under the point. */
  private pickEntity(wx: number, wy: number): string | null {
    const state = this.store.state;
    let best: { id: string; depth: number } | null = null;
    for (const [id, sprite] of this.sprites) {
      const e = state.entities[id];
      if (!e || !sprite.visible || hasCondition(e, 'dead')) continue;
      // Shrink the frame box a little: transparent margins shouldn't steal taps.
      const b = sprite.getBounds();
      Phaser.Geom.Rectangle.Inflate(b, -b.width * 0.15, -b.height * 0.1);
      if (!b.contains(wx, wy)) continue;
      if (!best || sprite.depth > best.depth) best = { id, depth: sprite.depth };
    }
    return best?.id ?? null;
  }

  /** Front-most tile (top surface or cliff face) under the world point. */
  private pickTile(wx: number, wy: number): Vec2 | null {
    for (let i = this.tiles.length - 1; i >= 0; i--) {
      const t = this.tiles[i]!;
      if (t.bounds.contains(wx, wy)) return t.pos;
    }
    return null;
  }

  private drawPathPreview(target: Vec2 | null): void {
    const g = this.pathPreview.clear();
    if (!target || this.busy) return;
    const state = this.store.state;
    const mover = state.entities[this.hooks.controlledEntityId()];
    if (!mover) return;
    const ruleset = this.store.engine.ruleset;
    // In combat, steps beyond this turn's movement are drawn red; dangerous ones orange.
    const left = state.turn.mode === 'combat' ? ruleset.movementBudget(mover, state) - state.turn.movementUsed : Infinity;
    const result = movePath(ruleset, state, mover.id, target, left);
    const extra = surfaceCost(ruleset, state);
    const hazard = surfaceHazard(ruleset, state);
    const T = this.grid.tile;
    const mark = (p: Vec2, color: number, alpha: number, inset: number) => {
      const c = this.grid.tileCentre(p.x, p.y, tileAt(state.map, p)!.height);
      g.fillStyle(color, alpha).fillRect(c.x - T / 2 + inset, c.y - T / 2 + inset, T - inset * 2, T - inset * 2);
    };
    if (!result) {
      if (tileAt(state.map, target)?.terrain !== 'void') mark(target, 0x8a2a1e, 0.45, 2);
      return;
    }
    let cost = 0;
    let prev = mover.position;
    result.path.forEach((p, i) => {
      const last = i === result.path.length - 1;
      cost += 1 + Math.max(0, (tileAt(state.map, p)?.height ?? 0) - (tileAt(state.map, prev)?.height ?? 0)) * ruleset.movement.climbCost + extra(p);
      prev = p;
      mark(p, cost > left ? 0x8a2a1e : hazard(p) > 0 ? 0xe07a2a : 0xc8b27a, last ? 0.5 : 0.3, last ? 2 : 11);
    });
  }
}
