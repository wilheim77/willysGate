import Phaser from 'phaser';
import { type GameState, type LightSource, type Vec2, lightingOf } from '../../engine';

const LIGHT_TEXTURE = 'fx:light';
const FLAME_TEXTURE = 'fx:flame';
const TEX_SIZE = 128;
const DARKNESS = 0x06050b;

/**
 * Renders the engine's lighting state: a darkness layer over the map with soft holes
 * cut by each light, plus an additive coloured glow. Flicker is visual only, so it
 * never changes game rules. One full-map RenderTexture keeps it cheap on mobile.
 */
export class LightingLayer {
  private darkness: Phaser.GameObjects.RenderTexture;
  private eraser: Phaser.GameObjects.Image;
  private glows = new Map<string, Phaser.GameObjects.Image>();
  private flames = new Map<string, Phaser.GameObjects.Image>();

  constructor(
    private scene: Phaser.Scene,
    width: number,
    height: number,
    private tile: number,
    depth: number,
  ) {
    LightingLayer.ensureTextures(scene);
    this.darkness = scene.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(depth);
    this.eraser = scene.make.image({ key: LIGHT_TEXTURE }, false);
  }

  destroy(): void {
    this.darkness.destroy();
    this.eraser.destroy();
    for (const g of this.glows.values()) g.destroy();
    for (const f of this.flames.values()) f.destroy();
  }

  /**
   * Redraws for this frame. `positionOf` gives each light's world position (pixels),
   * or null when it should not be drawn (e.g. its carrier left the map).
   */
  update(time: number, state: GameState, positionOf: (light: LightSource) => Vec2 | null): void {
    const { ambient, lights } = lightingOf(state);
    this.darkness.clear();
    if (ambient >= 1) return;
    this.darkness.fill(DARKNESS, 1 - ambient);

    const seen = new Set<string>();
    for (const light of lights) {
      const p = positionOf(light);
      if (!p) continue;
      seen.add(light.id);
      // Cheap organic flicker: two out-of-phase sines, per light.
      const phase = light.id.length * 1.7;
      const wobble = 1 + (light.flicker ?? 0) * (0.6 * Math.sin(time / 90 + phase) + 0.4 * Math.sin(time / 37 + phase * 2));
      const radiusPx = light.radius * this.tile * wobble;
      const scale = (radiusPx * 2) / TEX_SIZE;

      this.eraser.setScale(scale).setAlpha(Math.min(1, light.intensity));
      this.darkness.erase(this.eraser, p.x, p.y);

      const color = Phaser.Display.Color.HexStringToColor(light.color ?? '#ffd9a0').color;
      const glow = this.glows.get(light.id) ?? this.scene.add.image(0, 0, LIGHT_TEXTURE).setBlendMode(Phaser.BlendModes.ADD);
      glow.setPosition(p.x, p.y).setScale(scale * 0.8).setTint(color).setAlpha(0.18 * light.intensity).setDepth(this.darkness.depth + 1);
      this.glows.set(light.id, glow);

      // Fixed lights are torches/braziers: show the flame itself.
      if (!light.attachedTo) {
        const flame = this.flames.get(light.id) ?? this.scene.add.image(0, 0, FLAME_TEXTURE).setBlendMode(Phaser.BlendModes.ADD);
        flame.setPosition(p.x, p.y - this.tile * 0.3).setScale(0.9 + 0.25 * (wobble - 1) * 4).setTint(color).setDepth(this.darkness.depth + 2);
        this.flames.set(light.id, flame);
      }
    }
    for (const [id, g] of this.glows) if (!seen.has(id)) (g.destroy(), this.glows.delete(id));
    for (const [id, f] of this.flames) if (!seen.has(id)) (f.destroy(), this.flames.delete(id));
  }

  private static ensureTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists(LIGHT_TEXTURE)) {
      const tex = scene.textures.createCanvas(LIGHT_TEXTURE, TEX_SIZE, TEX_SIZE)!;
      const ctx = tex.getContext();
      const r = TEX_SIZE / 2;
      const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
      tex.refresh();
    }
    if (!scene.textures.exists(FLAME_TEXTURE)) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xff7a1a, 0.9).fillEllipse(4, 6, 6, 9);
      g.fillStyle(0xffe08a, 1).fillEllipse(4, 7, 3, 5);
      g.generateTexture(FLAME_TEXTURE, 8, 12);
      g.destroy();
    }
  }
}
