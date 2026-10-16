import Phaser from 'phaser';
import { type EntityMovedEvent, type GameState, type LightSource, type Tile, type Vec2, findPath, isEvent, lightPosition, posKey, tileAt } from '../../engine';
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
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragging = false;
  private pinchDistance: number | null = null;
  private grid: GridProjection;

  constructor(
    private store: GameStore,
    private manifest: AssetManifest,
    private theme: Theme,
    private hooks: MapSceneHooks,
  ) {
    super('map');
    this.grid = new GridProjection(manifest.tile.size, manifest.tile.levelHeight);
  }

  preload(): void {
    for (const [id, ts] of Object.entries(this.manifest.tilesets)) {
      this.load.spritesheet(tilesetKey(id), assetUrl(ts.url), { frameWidth: ts.frameWidth, frameHeight: ts.frameHeight });
    }
    for (const art of Object.values(this.manifest.sprites)) {
      if (!this.textures.exists(imageKey(art.url))) this.load.image(imageKey(art.url), assetUrl(art.url));
    }
  }

  create(): void {
    this.defineCharacterFrames();
    this.pathPreview = this.add.graphics().setDepth(1_000_000);
    this.buildWorld(this.store.state);

    const unsubscribe = this.store.subscribe((change, state) => {
      if (change.kind === 'reset') this.buildWorld(state);
      else for (const e of change.events) if (isEvent<EntityMovedEvent>(e, 'entityMoved')) this.animateMove(e, state);
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
      if (!art) continue;
      const tile = tileAt(map, entity.position)!;
      const c = this.grid.tileCentre(entity.position.x, entity.position.y, tile.height);
      const depth = this.grid.depth(entity.position.y, tile.height, 5);
      // Soft contact shadow, drawn by code so any art pack gets one.
      const shadow = this.add.ellipse(c.x, c.y, T * 0.7, T * 0.28, 0x000000, 0.35).setDepth(depth - 1);
      const sprite = this.add.sprite(c.x, c.y, imageKey(art.url)).setDepth(depth);
      this.sprites.set(entity.id, sprite);
      this.shadows.set(entity.id, shadow);
      this.idle(entity.id, this.facing.get(entity.id) ?? 's');
    }

    this.lighting = new LightingLayer(this, map.width * T, map.height * T, T, LIGHTING_DEPTH);
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

  private animateMove(event: EntityMovedEvent, state: GameState): void {
    const sprite = this.sprites.get(event.entityId);
    if (!sprite) return;
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
    this.tweens.chain({
      targets: sprite,
      tweens,
      onComplete: () => {
        this.animating--;
        this.idle(event.entityId, this.facing.get(event.entityId) ?? 's');
      },
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
      this.tweens.add({ targets: sprite, scaleY: 1.025, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
    );
  }

  private stopBreathing(entityId: string): void {
    this.breathing.get(entityId)?.remove();
    this.breathing.delete(entityId);
    this.sprites.get(entityId)?.setScale(1);
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
      if (!isTap || this.animating > 0) return;
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
    if (!target || this.animating > 0) return;
    const state = this.store.state;
    const mover = state.entities[this.hooks.controlledEntityId()];
    if (!mover) return;
    const blocked = new Set(
      Object.values(state.entities)
        .filter((e) => e.id !== mover.id)
        .map((e) => posKey(e.position)),
    );
    const result = findPath(state.map, mover.position, target, { blocked, rules: this.store.engine.ruleset.movement });
    const T = this.grid.tile;
    const mark = (p: Vec2, color: number, alpha: number, inset: number) => {
      const c = this.grid.tileCentre(p.x, p.y, tileAt(state.map, p)!.height);
      g.fillStyle(color, alpha).fillRect(c.x - T / 2 + inset, c.y - T / 2 + inset, T - inset * 2, T - inset * 2);
    };
    if (!result) {
      if (tileAt(state.map, target)?.terrain !== 'void') mark(target, 0x8a2a1e, 0.45, 2);
      return;
    }
    result.path.forEach((p, i) => {
      const last = i === result.path.length - 1;
      mark(p, 0xc8b27a, last ? 0.5 : 0.3, last ? 2 : 11);
    });
  }
}
