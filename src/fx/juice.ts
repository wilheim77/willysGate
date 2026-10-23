import Phaser from 'phaser';

/**
 * Small, reusable "game feel" effects driven by engine events. Every helper returns a
 * promise so the event player can sequence them. Intensities come from FxConfig so a
 * game (or the quality setting, Phase 6) can tone them down.
 */
export interface FxConfig {
  shake: number;
  hitStopMs: number;
  floatingText: boolean;
  particles: boolean;
}

export const DEFAULT_FX: FxConfig = { shake: 1, hitStopMs: 70, floatingText: true, particles: true };

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((resolve) => scene.time.delayedCall(ms, resolve));

export function tween(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => scene.tweens.add({ ...config, onComplete: () => resolve() }));
}

export class Juice {
  constructor(
    private scene: Phaser.Scene,
    private tile: number,
    private config: FxConfig = DEFAULT_FX,
  ) {}

  /** Text that pops up above a point and floats away. */
  floatText(x: number, y: number, text: string, color: string, size = 0.55, depth = 2_000_000): Promise<void> {
    if (!this.config.floatingText) return Promise.resolve();
    const t = this.scene.add
      .text(x, y - this.tile * 0.9, text, {
        fontFamily: 'VT323, monospace',
        fontSize: `${Math.round(this.tile * size)}px`,
        color,
        stroke: '#000000',
        strokeThickness: Math.max(2, Math.round(this.tile / 8)),
      })
      .setOrigin(0.5, 1)
      .setResolution(4)
      .setDepth(depth);
    // Keep it on screen: on a phone a long «+248 audiencia» over someone near an edge is cut off.
    const view = this.scene.cameras.main.worldView;
    if (view.width > 0 && t.width > view.width * 0.8) t.setScale((view.width * 0.8) / t.width);
    const half = (t.width * t.scaleX) / 2 + 4;
    if (view.width > half * 2) t.x = Math.min(Math.max(t.x, view.left + half), view.right - half);
    return tween(this.scene, { targets: t, y: t.y - this.tile * 0.8, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Cubic.easeOut' }).then(() => {
      t.destroy();
    });
  }

  /** Attacker lunges a third of a tile towards the target and back. */
  async lunge(sprite: Phaser.GameObjects.Sprite, towards: { x: number; y: number }): Promise<void> {
    const dx = towards.x - sprite.x;
    const dy = towards.y - sprite.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = this.tile * 0.35;
    await tween(this.scene, { targets: sprite, x: sprite.x + (dx / len) * reach, y: sprite.y + (dy / len) * reach, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** White flash and a small knock-back shiver on the victim. */
  async hit(sprite: Phaser.GameObjects.Sprite, from?: { x: number; y: number }): Promise<void> {
    sprite.setTintFill(0xffffff);
    const ox = sprite.x;
    const push = from ? Math.sign(sprite.x - from.x || 1) * this.tile * 0.12 : 0;
    await tween(this.scene, { targets: sprite, x: ox + push, duration: 60, yoyo: true });
    sprite.clearTint();
  }

  /** Brief freeze that sells the weight of a blow. */
  hitStop(): Promise<void> {
    if (this.config.hitStopMs <= 0) return Promise.resolve();
    this.scene.tweens.timeScale = 0.05;
    return wait(this.scene, this.config.hitStopMs).then(() => {
      this.scene.tweens.timeScale = 1;
    });
  }

  shake(strength = 1): void {
    if (this.config.shake <= 0) return;
    this.scene.cameras.main.shake(160, 0.006 * strength * this.config.shake);
  }

  /** A puff of small squares: blood (red), sparks (yellow), dust (grey). */
  burst(x: number, y: number, color: number, count = 8, depth = 1_500_000): void {
    if (!this.config.particles) return;
    for (let i = 0; i < count; i++) {
      const size = Math.max(1, Math.round(this.tile / 10));
      const p = this.scene.add.rectangle(x, y - this.tile * 0.4, size, size, color).setDepth(depth);
      const angle = Math.random() * Math.PI * 2;
      const dist = this.tile * (0.3 + Math.random() * 0.5);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y - this.tile * 0.4 + Math.sin(angle) * dist + this.tile * 0.3,
        alpha: 0,
        duration: 350 + Math.random() * 250,
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Expanding ring for spells and areas. */
  ring(x: number, y: number, radiusTiles: number, color: number, depth = 1_400_000): Promise<void> {
    const c = this.scene.add.circle(x, y, this.tile * 0.3, color, 0.35).setStrokeStyle(1, color, 0.9).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    return tween(this.scene, { targets: c, radius: this.tile * Math.max(0.5, radiusTiles), alpha: 0, duration: 420, ease: 'Cubic.easeOut' }).then(() => {
      c.destroy();
    });
  }

  /** Big centred text for "¡Combate!" and similar moments. */
  banner(text: string, color = '#e8d6b0'): Promise<void> {
    const cam = this.scene.cameras.main;
    const t = this.scene.add
      .text(cam.width / 2, cam.height * 0.35, text, { fontFamily: 'VT323, monospace', fontSize: '42px', color, stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3_000_000)
      .setScale(1 / cam.zoom)
      .setAlpha(0);
    // Fixed to the screen: compensate the camera zoom so it reads the same at any zoom.
    t.setPosition(cam.worldView.centerX, cam.worldView.y + cam.worldView.height * 0.35).setScrollFactor(1);
    return tween(this.scene, { targets: t, alpha: { from: 0, to: 1 }, duration: 180, yoyo: true, hold: 700 }).then(() => {
      t.destroy();
    });
  }
}

export { wait };
