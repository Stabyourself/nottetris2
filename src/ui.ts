import type { Sfx } from './audio';

export interface ChoiceItem {
  type: 'choice';
  label: string;
  options: string[];
  get: () => number;
  set: (i: number) => void;
}
export interface ButtonItem {
  type: 'button';
  label: string;
  action: () => void;
  /** Hotkeys (KeyboardEvent.code) that trigger this button directly. */
  keys?: string[];
  /** Short key name shown on the button, e.g. "R". */
  keyLabel?: string;
}
export interface SliderItem {
  type: 'slider';
  label: string;
  get: () => number; // 0..1
  set: (v: number) => void;
}
export type Item = ChoiceItem | ButtonItem | SliderItem;

export interface Screen {
  title?: string;
  titleClass?: string;
  /** Markup inside the title instead of the plain text (must already be escaped); `title` becomes its label. */
  titleHtml?: string;
  subtitle?: string;
  /** Extra markup shown under the items (score tables, stats...). Must already be escaped. */
  html?: () => string;
  htmlFirst?: boolean;
  items: Item[];
  footer?: string;
  onBack?: () => void;
  /** Also show `onBack` as a small "‹ Back" button in the panel's top-left corner. */
  backButton?: boolean;
  initial?: number;
  className?: string;
  /** Called after each render, e.g. to focus a text field. */
  afterRender?: (root: HTMLElement) => void;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export class Menu {
  private screen: Screen | null = null;
  private index = 0;
  private pointer: { x: number; y: number } | null = null;

  constructor(
    private root: HTMLElement,
    private sound: (s: Sfx) => void,
  ) {
    // Hover selects an item only when the mouse really moves. Re-rendering the menu (every arrow
    // press, every new screen) makes the browser fire pointerenter on whatever sits under a
    // resting mouse, which would steal the selection back from the keyboard.
    root.addEventListener('pointermove', (e) => {
      const last = this.pointer;
      this.pointer = { x: e.clientX, y: e.clientY };
      if (last && last.x === e.clientX && last.y === e.clientY) return;
      const el = (e.target as Element).closest<HTMLElement>('.item');
      if (!el) return;
      const i = Number(el.dataset.i);
      if (i === this.index) return;
      this.index = i;
      this.root.querySelectorAll('.item.sel').forEach((x) => x.classList.remove('sel'));
      el.classList.add('sel');
    });
  }

  get active(): boolean {
    return this.screen !== null;
  }

  /** The screen on show, so async work can check it is still the one it was started for. */
  get current(): Screen | null {
    return this.screen;
  }

  show(screen: Screen) {
    this.screen = screen;
    this.index = screen.initial ?? 0;
    this.root.hidden = false;
    this.render();
  }

  hide() {
    this.screen = null;
    this.root.innerHTML = '';
    this.root.hidden = true;
  }

  refresh() {
    if (this.screen) this.render();
  }

  /** Returns true when the key was used by the menu. */
  key(code: string): boolean {
    const s = this.screen;
    if (!s) return false;
    const hot = s.items.findIndex((it) => it.type === 'button' && it.keys?.includes(code));
    if (hot >= 0) {
      this.index = hot;
      this.sound('select');
      (s.items[hot] as ButtonItem).action();
      return true;
    }
    const n = s.items.length;
    const item = s.items[this.index];
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        if (n > 1) {
          this.index = (this.index - 1 + n) % n;
          this.sound('move');
          this.render();
        }
        return true;
      case 'ArrowDown':
      case 'KeyS':
      case 'Tab':
        if (n > 1) {
          this.index = (this.index + 1) % n;
          this.sound('move');
          this.render();
        }
        return true;
      case 'ArrowLeft':
      case 'KeyA':
      case 'ArrowRight':
      case 'KeyD': {
        const dir = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
        if (item?.type === 'choice') {
          const len = item.options.length;
          item.set((item.get() + dir + len) % len);
          this.sound('move');
          this.render();
        } else if (item?.type === 'slider') {
          item.set(Math.round(Math.min(1, Math.max(0, item.get() + dir * 0.1)) * 10) / 10);
          this.sound('move');
          this.render();
        }
        return true;
      }
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
      case 'KeyX':
      case 'PadA':
        if (!item) return true;
        if (item.type === 'button') {
          this.sound('select');
          item.action();
        } else if (item.type === 'choice') {
          item.set((item.get() + 1) % item.options.length);
          this.sound('move');
          this.render();
        }
        return true;
      case 'Escape':
      case 'Backspace':
      case 'KeyZ':
        if (s.onBack) {
          this.sound('back');
          s.onBack();
        }
        return true;
    }
    return false;
  }

  private render() {
    const s = this.screen!;
    const items = s.items
      .map((it, i) => {
        const sel = i === this.index ? ' sel' : '';
        if (it.type === 'button') {
          const kbd = it.keyLabel ? `<span class="kbd">${esc(it.keyLabel)}</span>` : '';
          return `<button class="item btn${sel}" data-i="${i}">${esc(it.label)}${kbd}</button>`;
        }
        if (it.type === 'choice') {
          const cur = it.get();
          const opts = it.options
            .map((o, j) => `<button class="opt${j === cur ? ' on' : ''}" data-i="${i}" data-o="${j}">${esc(o)}</button>`)
            .join('');
          return `<div class="item choice${sel}" data-i="${i}"><span class="lbl">${esc(it.label)}</span><span class="opts">${opts}</span></div>`;
        }
        const v = it.get();
        return `<div class="item slider${sel}" data-i="${i}"><span class="lbl">${esc(it.label)}</span><span class="bar" data-i="${i}"><span class="fill" style="width:${v * 100}%"></span></span><span class="val">${Math.round(v * 10)}</span></div>`;
      })
      .join('');
    const extra = s.html ? `<div class="extra">${s.html()}</div>` : '';
    this.root.innerHTML = `
      <div class="menu ${s.className ?? ''}">
        ${s.backButton && s.onBack ? '<button class="back" aria-label="Back">‹ Back<span class="kbd">Esc</span></button>' : ''}
        ${
          s.titleHtml
            ? `<h1 class="${s.titleClass ?? ''}" aria-label="${esc(s.title ?? '')}">${s.titleHtml}</h1>`
            : s.title
              ? `<h1 class="${s.titleClass ?? ''}">${esc(s.title)}</h1>`
              : ''
        }
        ${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ''}
        ${s.htmlFirst ? extra : ''}
        <div class="items">${items}</div>
        ${s.htmlFirst ? '' : extra}
        ${s.footer ? `<p class="footer">${s.footer}</p>` : ''}
      </div>`;

    this.root.querySelectorAll<HTMLButtonElement>('button.btn').forEach((el) => {
      el.addEventListener('click', () => {
        this.index = Number(el.dataset.i);
        const it = s.items[this.index];
        if (it.type === 'button') {
          this.sound('select');
          it.action();
        }
      });
    });
    this.root.querySelector<HTMLButtonElement>('button.back')?.addEventListener('click', () => {
      this.sound('back');
      s.onBack?.();
    });
    this.root.querySelectorAll<HTMLButtonElement>('button.opt').forEach((el) => {
      el.addEventListener('click', () => {
        const it = s.items[Number(el.dataset.i)];
        if (it.type !== 'choice') return;
        this.index = Number(el.dataset.i);
        it.set(Number(el.dataset.o));
        this.sound('move');
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLElement>('.bar').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        const it = s.items[Number(el.dataset.i)];
        if (it.type !== 'slider') return;
        const r = el.getBoundingClientRect();
        it.set(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 10) / 10);
        this.sound('move');
        this.render();
      });
    });
    s.afterRender?.(this.root);
  }
}
