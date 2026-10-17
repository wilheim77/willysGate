import type { AudioManager } from './AudioManager';

/**
 * Small presentational volume/mute widget for the HUD: one toggle button that opens a
 * popover with master/music/sfx sliders and a mute checkbox, all backed by `AudioManager`
 * (which already persists them to localStorage). Pure DOM, no engine/store knowledge.
 *
 * Usage (from `src/main.ts`, after `const audio = setupAudio(store, game);`):
 *   mountAudioControls(document.querySelector('.hud-top nav')!, audio);
 */
export class AudioControls {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private toggle: HTMLButtonElement;

  constructor(
    container: HTMLElement,
    private manager: AudioManager,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'audio-controls';

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'audio-toggle';
    this.toggle.setAttribute('aria-label', 'Sonido');
    this.root.append(this.toggle);

    this.panel = document.createElement('div');
    this.panel.className = 'audio-panel';
    this.panel.hidden = true;
    this.panel.append(
      this.slider('Maestro', 'master', (v) => this.manager.setMasterVolume(v)),
      this.slider('Música', 'music', (v) => this.manager.setMusicVolume(v)),
      this.slider('Efectos', 'sfx', (v) => this.manager.setSfxVolume(v)),
      this.muteCheckbox(),
    );
    this.root.append(this.panel);

    this.toggle.addEventListener('click', () => {
      this.panel.hidden = !this.panel.hidden;
    });
    document.addEventListener('click', (ev) => {
      if (!this.panel.hidden && !this.root.contains(ev.target as Node)) this.panel.hidden = true;
    });

    container.append(this.root);
    this.refreshIcon();
  }

  private slider(label: string, key: 'master' | 'music' | 'sfx', onChange: (v: number) => void): HTMLLabelElement {
    const wrap = document.createElement('label');
    wrap.className = 'audio-slider';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(this.manager.getVolumes()[key]);
    input.addEventListener('input', () => {
      onChange(Number(input.value));
    });
    wrap.append(span, input);
    return wrap;
  }

  private muteCheckbox(): HTMLLabelElement {
    const wrap = document.createElement('label');
    wrap.className = 'audio-mute';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.manager.getVolumes().muted;
    input.addEventListener('change', () => {
      this.manager.setMuted(input.checked);
      this.refreshIcon();
    });
    const span = document.createElement('span');
    span.textContent = 'Silenciar';
    wrap.append(input, span);
    return wrap;
  }

  private refreshIcon(): void {
    this.toggle.textContent = this.manager.getVolumes().muted ? '🔇' : '🔊';
  }
}

export function mountAudioControls(container: HTMLElement, manager: AudioManager): AudioControls {
  return new AudioControls(container, manager);
}
