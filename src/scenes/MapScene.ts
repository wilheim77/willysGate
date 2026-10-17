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
  hasCondition,
  isEvent,
  lightPosition,
  lightingOf,
  surfacesOf,
  tileAt,
} from '../../engine';
import { DEFAULT_FX, Juice, tween } from '../fx/juice';
import { type AssetManifest, type LpcAnimation, type SpriteArt, assetUrl, tilesetKey } from '../assets/manifest';
import { LightingLayer } from '../fx/LightingLayer';
import type { Theme } from '../game/definition';
import type { GameStore } from '../game/store';
import { GridProjection } from '../projection';

export interface MapSceneHooks {
  /** The player tapped/clicked a tile. */
  onTileSelected(tile: Vec2): void;
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
}

const STEP_MS = 160;
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
  private shadows = new Map<string, Phaser.GameObjects.Ellipse>();
  private lighting: LightingLayer | null = null;
  private facing = new Map<string, Dir>();
  private breathing = new Map<string, Phaser.Tweens.Tween>();
  private pathPreview!: Phaser.GameObjects.Graphics;
  private animating = 0;
  private queue: GameEvent[] = [];
  private playing = false;
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
      if (h > 0 && art.rim !== undefined) {
        // A single lip at the platform's south edge (the rest of the frame is transparent).
        this.worldObjects.push(this.add.image(c.x, c.y + T, key, art.rim).setDepth(depth + 0.5));
      }
      const frame = art.frames[variantHash(pos.x, pos.y) % art.frames.length]!;
      this.worldObjects.push(this.add.image(c.x, c.y, key, frame).setDepth(depth + 1));

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
      this.worldObjects.push(g);
      this.tiles.push({ pos, bounds: new Phaser.Geom.Rectangle(left, top, T, T + h * LH) });
    }

    for (const entity of Object.values(state.entities)) {
      const art = this.manifest.sprites[entity.spriteId];
      if (!art) {
        this.addPlaceholderEntity(entity.id, entity.spriteId, entity.position, map);
        continue;
      }
      const tile = tileAt(map, entity.position)!;
      const c = this.grid.tileCentre(entity.position.x, entity.position.y, tile.height);
      const depth = this.grid.depth(entity.position.y, tile.height, 5);
      // Soft contact shadow, drawn by code so any art pack gets one.
      const shadow = this.add.ellipse(c.x, c.y, T * 0.7, T * 0.28, 0x000000, 0.35).setDepth(depth - 1);
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
      if (light.attachedTo || !light.position || !propId || !props[propId]) continue;
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

  private animateMove(event: EntityMovedEvent, state: GameState): Promise<void> {
    const sprite = this.sprites.get(event.entityId);
    if (!sprite) return Promise.resolve();
    this.animating++;
    this.pathPreview.clear();
    this.stopBreathing(event.entityId);
    this.cameras.main.startFollow(sprite, true, 0.12, 0.12);

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
        duration: STEP_MS,
        onStart: () => {
          // While crossing two tiles, draw in front of both.
          sprite.setDepth(Math.max(this.grid.depth(from.y, fromTile.height, 5), this.grid.depth(step.y, tile.height, 5)));
          this.walk(event.entityId, this.directionOf(from, step));
        },
        onComplete: () => sprite.setDepth(this.grid.depth(step.y, tile.height, 5)),
      };
    });
    return new Promise((resolve) => {
      this.tweens.chain({
        targets: sprite,
        tweens,
        onComplete: () => {
          this.animating--;
          this.idle(event.entityId, this.facing.get(event.entityId) ?? 's');
          resolve();
        },
      });
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
        await this.play(event);
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
    switch (event.type) {
      case 'entityMoved':
        return this.animateMove(event as EntityMovedEvent, state);
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
        const attacker = sprite(e.attackerId);
        const target = this.centreOf(String(e.targetId));
        if (attacker && target) {
          this.face(String(e.attackerId), target.x < attacker.x ? 'w' : 'e');
          await this.juice.lunge(attacker, target);
        }
        if (target && !e.hit) await this.juice.floatText(target.x, target.y, this.texts.miss, '#b8b8b8');
        if (target && e.crit) {
          this.juice.shake(1.6);
          void this.juice.floatText(target.x, target.y - T * 0.4, this.texts.crit, '#ffd24a', 0.7);
          await this.juice.hitStop();
        }
        return;
      }
      case 'damageDealt': {
        const s = sprite(e.targetId);
        if (!s) return;
        this.playProp('fx_hit_spark', s.x, s.y - T * 0.4, 2_000_000);
        if (['slashing', 'piercing', 'bludgeoning'].includes(String(e.damageType))) this.bloodDecal(s.x, s.y, s.depth);
        this.juice.burst(s.x, s.y, 0x8a1c14, e.crit ? 14 : 8);
        void this.juice.floatText(s.x, s.y, `-${e.amount}`, '#ff6a55', e.crit ? 0.8 : 0.6);
        await this.juice.hit(s);
        return;
      }
      case 'healed': {
        const s = sprite(e.targetId);
        if (s && Number(e.amount) > 0) {
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
      case 'spellCast': {
        const caster = this.centreOf(String(e.casterId));
        const target = e.target as { entityId?: string; tile?: Vec2 } | undefined;
        if (caster) await this.juice.ring(caster.x, caster.y - T * 0.4, 0.6, 0x9ad0ff);
        const at = target?.tile
          ? this.grid.tileCentre(target.tile.x, target.tile.y, tileAt(state.map, target.tile)?.height ?? 0)
          : target?.entityId
            ? this.centreOf(target.entityId)
            : null;
        if (at && (at.x !== caster?.x || at.y !== caster?.y)) await this.juice.ring(at.x, at.y, target?.tile ? 2.5 : 0.8, 0xffa060);
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
      case 'surfaceChanged':
        this.drawSurfaces(state);
        return;
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
        await this.juice.banner(this.texts.combatStart);
        return;
      case 'combatEnded': {
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
      // Scenery breaks rather than lying down.
      s.setVisible(!dead);
      this.shadows.get(id)?.setVisible(false);
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
        sprite.play({ key: `surface:${surface.type}`, startFrame: (x * 7 + y * 3) % art.frames.length });
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
          this.anims.create({
            key,
            frames: rects.map((_, f) => ({ key: imageKey(art.url), frame: `${id}:${name}-${f}` })),
            frameRate: 8,
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
      sprite.play(`${id}:idle`, true);
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
      const tile = this.pickTile(p.worldX, p.worldY);
      if (tile) this.hooks.onTileSelected(tile);
    });

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), MIN_TILE_PX / this.grid.tile, MAX_TILE_PX / this.grid.tile));
    });
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
    const result = findPath(state.map, mover.position, target, { blocked: blockedTiles(ruleset, state, mover.id), rules: ruleset.movement });
    // In combat, steps beyond this turn's movement are drawn red.
    const left = state.turn.mode === 'combat' ? ruleset.movementBudget(mover, state) - state.turn.movementUsed : Infinity;
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
      cost += 1 + Math.max(0, (tileAt(state.map, p)?.height ?? 0) - (tileAt(state.map, prev)?.height ?? 0)) * ruleset.movement.climbCost;
      prev = p;
      mark(p, cost > left ? 0x8a2a1e : 0xc8b27a, last ? 0.5 : 0.3, last ? 2 : 11);
    });
  }
}
