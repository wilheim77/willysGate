import Phaser from 'phaser';
import { type EntityMovedEvent, type GameState, type Vec2, findPath, isEvent, posKey, tileAt } from '../../engine';
import { type AssetManifest, assetUrl, spriteKey, tilesetKey } from '../assets/manifest';
import type { GameStore } from '../game/store';
import { IsoProjection } from '../iso';

export interface MapSceneHooks {
  /** The player tapped/clicked a tile. */
  onTileSelected(tile: Vec2): void;
  /** Pointer is over a tile (or nothing). */
  onTileHovered(tile: Vec2 | null): void;
  controlledEntityId(): string;
}

const STEP_MS = 140;
const TAP_SLOP = 8;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 3;

/** Renders the GameState isometrically and turns input into tile selections. It never mutates state. */
export class MapScene extends Phaser.Scene {
  private tileCentres: { pos: Vec2; centre: Vec2 }[] = [];
  private tileObjects: Phaser.GameObjects.GameObject[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private pathPreview!: Phaser.GameObjects.Graphics;
  private animating = 0;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragging = false;
  private pinchDistance: number | null = null;
  private iso: IsoProjection;

  constructor(
    private store: GameStore,
    private manifest: AssetManifest,
    private hooks: MapSceneHooks,
  ) {
    super('map');
    this.iso = new IsoProjection(manifest.tile.width, manifest.tile.height, manifest.tile.levelHeight);
  }

  preload(): void {
    for (const [id, ts] of Object.entries(this.manifest.tilesets)) {
      this.load.spritesheet(tilesetKey(id), assetUrl(ts.url), { frameWidth: ts.frameWidth, frameHeight: ts.frameHeight });
    }
    for (const [id, art] of Object.entries(this.manifest.sprites)) {
      if (art.kind === 'spritesheet') {
        this.load.spritesheet(spriteKey(id), assetUrl(art.url), { frameWidth: art.frameWidth, frameHeight: art.frameHeight });
      }
    }
  }

  create(): void {
    this.generatePlaceholderSprites();
    this.pathPreview = this.add.graphics().setDepth(1_000_000);
    this.buildWorld(this.store.state);

    const unsubscribe = this.store.subscribe((change, state) => {
      if (change.kind === 'reset') this.buildWorld(state);
      else for (const e of change.events) if (isEvent<EntityMovedEvent>(e, 'entityMoved')) this.animateMove(e, state);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

    this.setupInput();
    this.cameras.main.setZoom(this.scale.width < 700 ? 1.5 : 2);
    this.focusOn(this.hooks.controlledEntityId(), false);
  }

  // --- World -------------------------------------------------------------

  private buildWorld(state: GameState): void {
    for (const o of this.tileObjects) o.destroy();
    this.tileObjects = [];
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.tileCentres = [];

    const { map } = state;
    this.iso.setMapSize(map.width, map.height);
    const order: Vec2[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) order.push({ x, y });
    order.sort((a, b) => this.iso.depth(a.x, a.y) - this.iso.depth(b.x, b.y));

    for (const pos of order) {
      const tile = tileAt(map, pos)!;
      if (tile.terrain === 'void') continue;
      const art = this.manifest.terrain[tile.terrain] ?? this.manifest.terrain.stone!;
      const c = this.iso.tileToWorld(pos.x, pos.y, tile.height);

      // Side faces: raised blocks show their full height; floor tiles get a thin slab edge.
      const drop = tile.height * this.iso.levelH + 6;
      const TILE_W = this.iso.tileW;
      const TILE_H = this.iso.tileH;
      const side = Phaser.Display.Color.HexStringToColor(art.side).color;
      const sideDark = Phaser.Display.Color.ValueToColor(side).darken(25).color;
      const g = this.add.graphics();
      g.fillStyle(side).fillPoints(
        [
          new Phaser.Math.Vector2(c.x - TILE_W / 2, c.y),
          new Phaser.Math.Vector2(c.x, c.y + TILE_H / 2),
          new Phaser.Math.Vector2(c.x, c.y + TILE_H / 2 + drop),
          new Phaser.Math.Vector2(c.x - TILE_W / 2, c.y + drop),
        ],
        true,
      );
      g.fillStyle(sideDark).fillPoints(
        [
          new Phaser.Math.Vector2(c.x, c.y + TILE_H / 2),
          new Phaser.Math.Vector2(c.x + TILE_W / 2, c.y),
          new Phaser.Math.Vector2(c.x + TILE_W / 2, c.y + drop),
          new Phaser.Math.Vector2(c.x, c.y + TILE_H / 2 + drop),
        ],
        true,
      );
      g.setDepth(this.iso.depth(pos.x, pos.y));
      const top = this.add.image(c.x, c.y, tilesetKey(art.tileset), art.frame).setDepth(this.iso.depth(pos.x, pos.y, 1));
      this.tileObjects.push(g, top);
      this.tileCentres.push({ pos, centre: c });
    }

    for (const entity of Object.values(state.entities)) {
      const tile = tileAt(map, entity.position)!;
      const c = this.iso.tileToWorld(entity.position.x, entity.position.y, tile.height);
      const img = this.add
        .image(c.x, c.y + 4, spriteKey(entity.spriteId))
        .setOrigin(0.5, 1)
        .setDepth(this.iso.depth(entity.position.x, entity.position.y, 5));
      this.sprites.set(entity.id, img);
    }
  }

  private animateMove(event: EntityMovedEvent, state: GameState): void {
    const img = this.sprites.get(event.entityId);
    if (!img) return;
    this.animating++;
    this.pathPreview.clear();
    this.cameras.main.startFollow(img, true, 0.12, 0.12);

    let prev = event.from;
    const tweens = event.path.map((step) => {
      const from = prev;
      prev = step;
      const tile = tileAt(state.map, step)!;
      const c = this.iso.tileToWorld(step.x, step.y, tile.height);
      return {
        x: c.x,
        y: c.y + 4,
        duration: STEP_MS,
        onStart: () => {
          // While crossing two tiles, draw above the one further back.
          img.setDepth(Math.max(this.iso.depth(from.x, from.y, 5), this.iso.depth(step.x, step.y, 5)));
          const a = this.iso.toView(from.x, from.y);
          const b = this.iso.toView(step.x, step.y);
          // Face left when moving towards the left of the screen.
          if (b.x - a.x !== b.y - a.y) img.setFlipX(b.x - a.x < b.y - a.y);
        },
        onComplete: () => img.setDepth(this.iso.depth(step.x, step.y, 5)),
      };
    });
    this.tweens.chain({
      targets: img,
      tweens,
      onComplete: () => {
        this.animating--;
      },
    });
  }

  /** Rotates the view a quarter turn (1 = clockwise, -1 = counter-clockwise), keeping the leader centred. */
  rotate(direction: 1 | -1): void {
    if (!this.pathPreview || this.animating > 0) return; // not created yet, or mid-move
    this.iso.rotation = (this.iso.rotation + direction + 4) % 4;
    this.pathPreview.clear();
    this.buildWorld(this.store.state);
    this.cameras.main.stopFollow();
    this.focusOn(this.hooks.controlledEntityId(), false);
  }

  private focusOn(entityId: string, follow: boolean): void {
    const img = this.sprites.get(entityId);
    if (!img) return;
    if (follow) this.cameras.main.startFollow(img, true, 0.12, 0.12);
    else this.cameras.main.centerOn(img.x, img.y);
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
        if (this.pinchDistance) cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dist / this.pinchDistance), MIN_ZOOM, MAX_ZOOM));
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

    this.input.keyboard?.on('keydown-Q', () => this.rotate(-1));
    this.input.keyboard?.on('keydown-E', () => this.rotate(1));

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM));
    });
  }

  /** Front-most tile whose top face contains the world point. */
  private pickTile(wx: number, wy: number): Vec2 | null {
    for (let i = this.tileCentres.length - 1; i >= 0; i--) {
      const t = this.tileCentres[i]!;
      if (this.iso.inTopFace(t.centre, { x: wx, y: wy })) return t.pos;
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
    const mark = (p: Vec2, color: number, alpha: number, scale: number) => {
      const c = this.iso.tileToWorld(p.x, p.y, tileAt(state.map, p)!.height);
      const w = (this.iso.tileW / 2) * scale;
      const h = (this.iso.tileH / 2) * scale;
      g.fillStyle(color, alpha).fillPoints(
        [
          new Phaser.Math.Vector2(c.x, c.y - h),
          new Phaser.Math.Vector2(c.x + w, c.y),
          new Phaser.Math.Vector2(c.x, c.y + h),
          new Phaser.Math.Vector2(c.x - w, c.y),
        ],
        true,
      );
    };
    if (!result) {
      if (tileAt(state.map, target)?.terrain !== 'void') mark(target, 0x8a2a1e, 0.45, 0.9);
      return;
    }
    result.path.forEach((p, i) => mark(p, 0xc8b27a, i === result.path.length - 1 ? 0.55 : 0.3, i === result.path.length - 1 ? 0.9 : 0.35));
  }

  // --- Placeholder art ---------------------------------------------------

  /** Draws simple hooded figures for sprites the manifest marks as placeholders (see TODO-ART.md). */
  private generatePlaceholderSprites(): void {
    for (const [id, art] of Object.entries(this.manifest.sprites)) {
      if (art.kind !== 'placeholder' || this.textures.exists(spriteKey(id))) continue;
      const color = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
      const g = this.make.graphics({}, false);
      g.fillStyle(0x000000, 0.35).fillEllipse(16, 44, 22, 7); // shadow
      g.fillStyle(color(art.cloak)).fillTriangle(16, 10, 4, 44, 28, 44); // cloak
      g.fillStyle(color(art.trim)).fillRect(7, 36, 18, 3); // belt / trim
      g.fillStyle(color(art.cloak)).fillCircle(16, 12, 7); // hood
      g.fillStyle(color(art.skin)).fillCircle(17, 13, 4); // face
      g.fillStyle(0x9a9a9a).fillRect(24, 22, 2, 18); // blade
      g.generateTexture(spriteKey(id), 32, 48);
      g.destroy();
    }
  }
}
