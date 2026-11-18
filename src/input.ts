import type { Controls } from './field';

type Action = keyof Controls;
type KeyMap = Record<Action, string[]>;

// Rotation is on Z / X, or J / K to pair with WASD; Up does nothing during play.
export const KEYS_SINGLE: KeyMap = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  down: ['ArrowDown', 'KeyS'],
  rotL: ['KeyZ', 'KeyJ'],
  rotR: ['KeyX', 'KeyK'],
};

export const KEYS_P1: KeyMap = {
  left: ['KeyA'],
  right: ['KeyD'],
  down: ['KeyS'],
  rotL: ['KeyQ'],
  rotR: ['KeyE'],
};

export const KEYS_P2: KeyMap = {
  left: ['ArrowLeft', 'KeyJ'],
  right: ['ArrowRight', 'KeyL'],
  down: ['ArrowDown', 'KeyK'],
  rotL: ['KeyU', 'Comma', 'Numpad1'],
  rotR: ['KeyO', 'Period', 'Numpad2'],
};

const held = new Set<string>();
/** Keys still held from a menu press: ignored by the game until released (controls.held in the original). */
const suppressed = new Set<string>();
const touch = new Set<Action>();

window.addEventListener('keydown', (e) => held.add(e.code));
window.addEventListener('keyup', (e) => {
  held.delete(e.code);
  suppressed.delete(e.code);
});
window.addEventListener('blur', () => {
  held.clear();
  suppressed.clear();
  touch.clear();
});

export function suppressHeldKeys() {
  for (const k of held) suppressed.add(k);
  padSuppressed = true;
}

function keyDown(code: string) {
  return held.has(code) && !suppressed.has(code);
}

// ---------------------------------------------------------------- gamepads

let padSuppressed = false;

function padControls(index: number): Controls {
  const none: Controls = { left: false, right: false, down: false, rotL: false, rotR: false };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[index];
  if (!pad) return none;
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  const c: Controls = {
    left: b(14) || ax < -0.45,
    right: b(15) || ax > 0.45,
    down: b(13) || ay > 0.55,
    rotR: b(0) || b(5) || b(7),
    rotL: b(1) || b(2) || b(4) || b(6),
  };
  if (padSuppressed) {
    if (Object.values(c).some(Boolean)) return none;
    padSuppressed = false;
  }
  return c;
}

/** Edge-triggered gamepad buttons, turned into virtual key presses for menus/pause. */
const prevPad = new Map<string, boolean>();
export function pollPadPresses(onPress: (code: string) => void) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const map: [string, boolean][] = [
      ['ArrowUp', !!pad.buttons[12]?.pressed || ay < -0.6],
      ['ArrowDown', !!pad.buttons[13]?.pressed || ay > 0.6],
      ['ArrowLeft', !!pad.buttons[14]?.pressed || ax < -0.6],
      ['ArrowRight', !!pad.buttons[15]?.pressed || ax > 0.6],
      ['Enter', !!pad.buttons[9]?.pressed],
      ['PadA', !!pad.buttons[0]?.pressed],
      ['Escape', !!pad.buttons[1]?.pressed || !!pad.buttons[8]?.pressed],
    ];
    for (const [code, on] of map) {
      const key = `${pad.index}:${code}`;
      if (on && !prevPad.get(key)) onPress(code);
      prevPad.set(key, on);
    }
  }
}

// ---------------------------------------------------------------- touch

export function setTouch(action: Action, on: boolean) {
  if (on) touch.add(action);
  else touch.delete(action);
}

export function clearTouch() {
  touch.clear();
}

// ---------------------------------------------------------------- combined

function fromKeys(map: KeyMap): Controls {
  const r = (a: Action) => map[a].some(keyDown);
  return { left: r('left'), right: r('right'), down: r('down'), rotL: r('rotL'), rotR: r('rotR') };
}

function or(a: Controls, b: Controls): Controls {
  return {
    left: a.left || b.left,
    right: a.right || b.right,
    down: a.down || b.down,
    rotL: a.rotL || b.rotL,
    rotR: a.rotR || b.rotR,
  };
}

export function singleControls(): Controls {
  const t: Controls = {
    left: touch.has('left'),
    right: touch.has('right'),
    down: touch.has('down'),
    rotL: touch.has('rotL'),
    rotR: touch.has('rotR'),
  };
  return or(or(fromKeys(KEYS_SINGLE), padControls(0)), t);
}

export function versusControls(player: 0 | 1): Controls {
  return or(fromKeys(player === 0 ? KEYS_P1 : KEYS_P2), padControls(player));
}
