import './style.css';
import { audio, TRACKS } from './audio';
import { STEP } from './config';
import { Demo } from './demo';
import { logoHtml } from './logo';
import { H, SINGLE_W, SingleGame, VersusGame } from './games';
import { clearTouch, pollPadPresses, setTouch, suppressHeldKeys } from './input';
import { COLORS, drawBackground, drawField, setTheme } from './render';
import { type Boards, fetchBoards, NAME_MAX, normalizeName, submitScore, type Submitted } from './api';
import {
  type GameMode,
  type ThemeName,
  addHighScore,
  highScores,
  loadSettings,
  qualifies,
  saveSettings,
  TABLE_SIZE,
} from './storage';
import { Menu, esc } from './ui';

/** package.json's version, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const stage = document.getElementById('stage')!;
const overlay = document.getElementById('overlay')!;
const touchEl = document.getElementById('touch')!;
const pauseBtn = document.getElementById('pausebtn') as HTMLButtonElement;
const toastEl = document.getElementById('toast')!;
document.getElementById('version')!.textContent = `v${__APP_VERSION__}`;

const settings = loadSettings();
audio.setVolumes(settings.sfx, settings.music);
audio.setMuted(settings.muted);
const menu = new Menu(overlay, (s) => audio.play(s));

type AppState = 'title' | 'menu' | 'game' | 'paused' | 'gameover' | 'results';
let state: AppState = 'title';
let game: SingleGame | VersusGame | null = null;
let demo = new Demo();
let logicalW = SINGLE_W;
let scale = 1;
let cssScale = 1;

const MODES: GameMode[] = ['cut', 'versus'];
const MODE_NAMES: Record<GameMode, string> = { cut: 'Cut', versus: 'Versus' };
const THEMES: ThemeName[] = ['modern', 'retro'];
const THEME_NAMES: Record<ThemeName, string> = { modern: 'Modern', retro: 'Retro' };
const isCoarse = window.matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ look

/** Applies settings.theme to the canvas drawing and, through data-theme, to the HTML menus. */
function applyTheme() {
  if (!THEMES.includes(settings.theme)) settings.theme = 'modern';
  setTheme(settings.theme);
  document.documentElement.dataset.theme = settings.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS.bg);
}

// ------------------------------------------------------------------ layout

function fit() {
  const touchH = touchEl.hidden ? 0 : touchEl.getBoundingClientRect().height;
  const availW = window.innerWidth;
  const availH = window.innerHeight - touchH;
  const s = Math.max(0.2, Math.min(availW / logicalW, availH / H));
  const cssW = Math.floor(logicalW * s);
  const cssH = Math.floor(H * s);
  const dpr = window.devicePixelRatio || 1;
  stage.style.width = `${cssW}px`;
  stage.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.width / logicalW;
  cssScale = s;
  stage.style.setProperty('--s', String(Math.max(0.55, s)));
  updateHud();
}

/** Shows the HTML pause button over the game's HUD slot while a game is running. */
function updateHud() {
  const rect = state === 'game' && game ? game.pauseRect : null;
  pauseBtn.hidden = !rect;
  if (!rect) return;
  pauseBtn.style.left = `${rect.x * cssScale}px`;
  pauseBtn.style.top = `${rect.y * cssScale}px`;
  pauseBtn.style.width = `${rect.w * cssScale}px`;
  pauseBtn.style.height = `${rect.h * cssScale}px`;
  pauseBtn.style.fontSize = `${14 * cssScale}px`;
}

let toastTimer = 0;
function toast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1100);
}

function toggleMute() {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  saveSettings(settings);
  toast(settings.muted ? 'Sound off' : 'Sound on');
  menu.refresh();
}

function setLayout(w: number) {
  if (w !== logicalW) {
    logicalW = w;
    fit();
  }
}

function updateTouch() {
  const show = isCoarse && state === 'game' && game?.type === 'single';
  if (touchEl.hidden === show) {
    touchEl.hidden = !show;
    fit();
  }
  if (!show) clearTouch();
  updateHud();
}

window.addEventListener('resize', fit);

// ------------------------------------------------------------------ music

/** Plays the chosen track. Moving between menus keeps it going; `restart` starts it over. */
function startMusic(restart = false) {
  if (settings.track >= 0) audio.playTrack(settings.track, restart);
  else audio.stopMusic();
}

// ------------------------------------------------------------------ screens

function showTitle() {
  state = 'title';
  game = null;
  startMusic();
  setLayout(SINGLE_W);
  updateTouch();
  menu.show({
    className: 'title',
    title: 'Slicefall',
    titleClass: 'logo',
    titleHtml: logoHtml(),
    subtitle: 'Blocks with real physics. Rows get sliced out once they are packed full enough.',
    items: [
      { type: 'button', label: 'Play', action: showModeSelect },
      { type: 'button', label: 'Leaderboard', action: showLeaderboard },
      { type: 'button', label: 'Options', action: () => showOptions(showTitle) },
    ],
    footer:
      'Gameplay ported from <a href="https://github.com/Stabyourself/nottetris2" target="_blank" rel="noopener">Not Tetris 2</a> by Maurice Guégan, a physics take on Tetris, which Alexey Pajitnov created in 1984.<br>Press F for fullscreen.',
  });
}

function modeInfo(mode: GameMode): string {
  const text: Record<GameMode, string> = {
    cut: 'Endless. A row is sliced out when it holds 8.1 blocks’ worth of area, cutting right through the pieces. Tighter rows score more. Every 10 rows the pieces fall faster.',
    versus: 'Two players, one keyboard (or two gamepads). Same pieces, mirrored for player 1, and rows are cut as in Cut. Once both have topped out, the higher score wins.',
  };
  let out = `<p class="info">${text[mode]}</p>`;
  if (mode === 'versus') {
    out += `<div class="keys"><div><b>Player 1</b>A D move · S down · Q E rotate</div><div><b>Player 2</b>J L move · K down · U O rotate<br><span>or ← → ↓ and , .</span></div></div>`;
  } else {
    out += scoreTable(-1);
  }
  return out;
}

function scoreTable(highlight: number): string {
  const rows = highScores();
  const lines: string[] = [];
  for (let i = 0; i < TABLE_SIZE; i++) {
    const r = rows[i];
    lines.push(
      `<tr class="${i === highlight ? 'me' : ''}"><td>${i + 1}</td><td>${r ? esc(r.name) : '—'}</td><td>${r ? r.score : ''}</td></tr>`,
    );
  }
  return `<table class="scores"><caption>Your best on this device</caption>${lines.join('')}</table>`;
}

// ------------------------------------------------------------------ online leaderboard

const BOARD_ROWS = 10;
type Period = 'week' | 'allTime';

/** What a leaderboard panel shows. Screens keep one and re-render as data arrives. */
interface BoardView {
  period: Period;
  data: Boards | null;
  status: 'loading' | 'ok' | 'offline';
  /** Name to highlight (the player's own) */
  me: string | null;
  /** Set after submitting a score: where the player now stands */
  ranks: { week: number | null; allTime: number | null } | null;
  /** Row of the local table to highlight when the server can't be reached */
  localRank: number;
}

function boardView(localRank = -1): BoardView {
  return { period: 'week', data: null, status: 'loading', me: normalizeName(settings.name), ranks: null, localRank };
}

function loadBoards(view: BoardView, request: Promise<Boards | Submitted>) {
  const screen = menu.current;
  view.status = 'loading';
  request
    .then((data) => {
      view.data = data;
      view.status = 'ok';
      if ('weekRank' in data) {
        view.me = data.name;
        view.ranks = { week: data.weekRank, allTime: data.allTimeRank };
      }
    })
    .catch(() => {
      view.status = 'offline';
    })
    .finally(() => {
      if (menu.current === screen) menu.refresh();
    });
}

function boardHtml(view: BoardView): string {
  const title = view.period === 'week' ? 'This week' : 'All time';
  if (view.status === 'offline') {
    return `<p class="rankline warn">The online leaderboard can’t be reached right now.</p>${scoreTable(view.localRank)}`;
  }
  const entries = view.status === 'ok' && view.data ? view.data[view.period] : [];
  const rows: string[] = [];
  for (let i = 0; i < BOARD_ROWS; i++) {
    const e = entries[i];
    const me = e && e.name === view.me ? ' class="me"' : '';
    rows.push(
      e
        ? `<tr${me}><td>${e.rank}</td><td>${esc(e.name)}</td><td class="sub">${e.lines}</td><td>${e.score}</td></tr>`
        : `<tr><td>${i + 1}</td><td>—</td><td class="sub"></td><td></td></tr>`,
    );
  }
  const head = '<tr class="head"><th>#</th><th>Name</th><th class="sub">Lines</th><th>Score</th></tr>';

  let line = '&nbsp;';
  if (view.status === 'loading') line = 'Loading…';
  else if (view.ranks) {
    const r = view.ranks;
    line = `You: #${r.week ?? '–'} this week · #${r.allTime ?? '–'} all time`;
  } else if (!entries.length) line = view.period === 'week' ? 'No scores yet this week. Be the first!' : 'No scores yet. Be the first!';
  return `<table class="scores board"><caption>${title}</caption>${head}${rows.join('')}</table><p class="rankline">${line}</p>`;
}

function periodChoice(view: BoardView) {
  return {
    type: 'choice' as const,
    label: 'Board',
    options: ['This week', 'All time'],
    get: () => (view.period === 'week' ? 0 : 1),
    set: (i: number) => {
      view.period = i === 0 ? 'week' : 'allTime';
    },
  };
}

function showLeaderboard() {
  state = 'menu';
  const view = boardView();
  menu.show({
    title: 'Leaderboard',
    className: 'tight',
    items: [periodChoice(view)],
    html: () => boardHtml(view),
    footer: 'Best score per name · weeks start Monday 00:00 UTC',
    onBack: showTitle,
    backButton: true,
  });
  loadBoards(view, fetchBoards());
}

function showModeSelect() {
  state = 'menu';
  game = null;
  setLayout(SINGLE_W);
  updateTouch();
  startMusic();
  menu.show({
    title: 'Game type',
    // The subtitle takes the row Back used to have, so Start still lands under the mouse after clicking Play
    subtitle: 'Pick a mode and some music.',
    className: 'pinned',
    items: [
      {
        type: 'choice',
        label: 'Mode',
        options: MODES.map((m) => MODE_NAMES[m]),
        get: () => MODES.indexOf(settings.mode),
        set: (i) => {
          settings.mode = MODES[i];
          saveSettings(settings);
        },
      },
      {
        type: 'choice',
        label: 'Music',
        options: [...TRACKS.map((t) => t.name), 'Off'],
        get: () => (settings.track < 0 ? TRACKS.length : settings.track),
        set: (i) => {
          settings.track = i >= TRACKS.length ? -1 : i;
          saveSettings(settings);
          startMusic();
        },
      },
      { type: 'button', label: 'Start', action: startGame, primary: true },
    ],
    initial: 2,
    html: () => modeInfo(settings.mode),
    onBack: showTitle,
    backButton: true,
  });
}

function showOptions(back: () => void) {
  menu.show({
    title: 'Options',
    items: [
      {
        type: 'choice',
        label: 'Audio',
        options: ['On', 'Muted'],
        get: () => (settings.muted ? 1 : 0),
        set: (i) => {
          settings.muted = i === 1;
          audio.setMuted(settings.muted);
          saveSettings(settings);
        },
      },
      {
        type: 'slider',
        label: 'Sound',
        get: () => settings.sfx,
        set: (v) => {
          settings.sfx = v;
          audio.setVolumes(settings.sfx, settings.music);
          saveSettings(settings);
        },
      },
      {
        type: 'slider',
        label: 'Music',
        get: () => settings.music,
        set: (v) => {
          settings.music = v;
          audio.setVolumes(settings.sfx, settings.music);
          saveSettings(settings);
        },
      },
      {
        type: 'choice',
        label: 'Graphics',
        options: THEMES.map((t) => THEME_NAMES[t]),
        get: () => THEMES.indexOf(settings.theme),
        set: (i) => {
          settings.theme = THEMES[i];
          saveSettings(settings);
          applyTheme();
        },
      },
      { type: 'button', label: 'Toggle fullscreen', keyLabel: 'F', action: toggleFullscreen },
    ],
    footer: 'M mutes sound at any time.',
    onBack: back,
    backButton: true,
  });
}

function startGame() {
  menu.hide();
  audio.unlock();
  suppressHeldKeys();
  if (settings.mode === 'versus') {
    audio.stopMusic();
    game = new VersusGame(startMusic, showVersusResults);
  } else {
    game = new SingleGame(onSingleOver);
    game.start();
    startMusic(true);
  }
  setLayout(game.width);
  state = 'game';
  updateTouch();
}

function pause() {
  if (state !== 'game' || !game) return;
  if (game.type === 'versus' && game.phase === 'done') return;
  game.paused = true;
  state = 'paused';
  audio.pauseMusic();
  audio.play('pause');
  updateTouch();
  menu.show({
    title: 'Paused',
    className: 'compact',
    items: [
      { type: 'button', label: 'Resume', keys: ['KeyP'], keyLabel: 'P', action: resume },
      { type: 'button', label: 'Restart', keys: ['KeyR'], keyLabel: 'R', action: startGame },
      { type: 'button', label: 'Options', keys: ['KeyO'], keyLabel: 'O', action: () => showOptions(pauseMenuAgain) },
      { type: 'button', label: 'Quit to menu', keys: ['KeyQ'], keyLabel: 'Q', action: showModeSelect },
    ],
    footer: 'Esc also resumes · M mute · F fullscreen',
    onBack: resume,
  });
}

function pauseMenuAgain() {
  state = 'game';
  pause();
}

function resume() {
  if (!game) return;
  menu.hide();
  game.paused = false;
  state = 'game';
  suppressHeldKeys();
  audio.resumeMusic();
  updateTouch();
}

/** Game over in Cut: ask for a name, then show where the score landed. */
function onSingleOver() {
  const g = game as SingleGame;
  state = 'gameover';
  updateTouch();
  const f = g.field;
  if (f.score <= 0) {
    showGameOver(g, fetchBoards(), -1);
    return;
  }
  const personalBest = qualifies(f.score);
  if (personalBest) audio.play('highscore');

  const submit = () => {
    const input = overlay.querySelector<HTMLInputElement>('input.name');
    const name = normalizeName(input?.value ?? '');
    if (!name) {
      overlay.querySelector('.namefield')?.classList.add('bad');
      audio.play('back');
      input?.focus();
      return;
    }
    settings.name = name;
    saveSettings(settings);
    const localRank = personalBest ? addHighScore({ name, score: f.score }) : -1;
    const request = submitScore({
      name,
      score: f.score,
      lines: f.lines,
      level: f.level,
      pieces: f.placed,
      durationMs: Math.round(g.elapsed * 1000),
    });
    showGameOver(g, request, localRank);
  };
  const skip = () => showGameOver(g, fetchBoards(), -1);

  menu.show({
    title: personalBest ? 'New high score!' : 'Game over',
    className: 'compact',
    htmlFirst: true,
    html: () =>
      `<p class="big">${f.score}</p>` +
      `<label class="namefield">Name for the leaderboard<input class="name" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="YOUR NAME" value="${esc(settings.name)}"></label>` +
      `<p class="hint">Up to ${NAME_MAX} letters, digits, spaces or . - _ ! ? '</p>`,
    items: [
      { type: 'button', label: 'Submit score', keyLabel: '↵', action: submit },
      { type: 'button', label: 'Skip', keyLabel: 'Esc', action: skip },
    ],
    onBack: skip,
    afterRender: (root) => {
      const input = root.querySelector<HTMLInputElement>('input.name');
      if (!input) return;
      input.focus();
      input.select();
      input.addEventListener('input', () => root.querySelector('.namefield')?.classList.remove('bad'));
      // Enter in the field always submits, wherever the mouse happens to rest.
      input.addEventListener('keydown', (e) => {
        if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
        e.preventDefault();
        e.stopPropagation();
        audio.play('select');
        submit();
      });
    },
  });
}

function showGameOver(g: SingleGame, request: Promise<Boards | Submitted>, localRank: number) {
  const f = g.field;
  const stats = `<div class="stats"><div><span>Score</span><b>${f.score}</b></div><div><span>Level</span><b>${f.level}</b></div><div><span>Lines</span><b>${f.lines}</b></div></div>`;
  const view = boardView(localRank);
  menu.show({
    title: 'Game over',
    className: 'results tight',
    htmlFirst: true,
    html: () => stats + boardHtml(view),
    items: [
      periodChoice(view),
      { type: 'button', label: 'Play again', action: startGame },
    ],
    initial: 1,
    onBack: showModeSelect,
    backButton: true,
  });
  loadBoards(view, request);
}

function showVersusResults() {
  const g = game as VersusGame;
  state = 'results';
  updateTouch();
  const [a, b] = g.fields.map((f) => f.score);
  menu.show({
    title: g.winner === 2 ? 'Draw!' : `Player ${g.winner + 1} wins!`,
    className: 'compact',
    htmlFirst: true,
    html: () =>
      `<div class="stats"><div><span>Player 1</span><b>${a}</b></div><div><span>Player 2</span><b>${b}</b></div></div><p class="info center">Wins ${VersusGame.wins[0]} – ${VersusGame.wins[1]}</p>`,
    items: [
      { type: 'button', label: 'Rematch', action: startGame },
      { type: 'button', label: 'Change mode', action: showModeSelect },
    ],
    onBack: showModeSelect,
  });
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

// ------------------------------------------------------------------ input routing

const PAUSE_KEYS = new Set(['Enter', 'NumpadEnter', 'Escape', 'KeyP']);
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace']);

function handleKey(code: string) {
  if (menu.active && menu.key(code)) return;
  if (state === 'game' && PAUSE_KEYS.has(code)) pause();
}

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.target instanceof HTMLInputElement) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
      e.preventDefault();
      handleKey(e.code);
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (SCROLL_KEYS.has(e.code)) e.preventDefault();
  // The menu handles Enter itself; stop a focused (mouse-clicked) button from also "clicking" natively.
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && menu.active) e.preventDefault();
  if (e.code === 'KeyF' && !e.repeat) {
    toggleFullscreen();
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) {
    toggleMute();
    return;
  }
  const nav = e.code.startsWith('Arrow') && menu.active;
  if (e.repeat && !nav) return;
  handleKey(e.code);
});

window.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', () => pause());

// Keep the button from taking keyboard focus, so Space/Enter never "click" it again later.
pauseBtn.addEventListener('pointerdown', (e) => e.preventDefault());
pauseBtn.addEventListener('click', () => pause());

touchEl.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((btn) => {
  const action = btn.dataset.a as 'left' | 'right' | 'down' | 'rotL' | 'rotR';
  const on = (e: PointerEvent) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    setTouch(action, true);
  };
  const off = () => {
    btn.classList.remove('down');
    setTouch(action, false);
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('lostpointercapture', off);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// ------------------------------------------------------------------ loop

const DEMO_AT = { x: (SINGLE_W - 328) / 2, y: 32 };

function tick(dt: number) {
  if (state === 'title' || state === 'menu') demo.update(dt);
  else if (game) game.update(dt);
}

/** `alpha`: how far this frame is between the last two physics steps (0–1), so motion stays even at any refresh rate. */
function draw(alpha: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if ((state === 'title' || state === 'menu') && !game) {
    drawBackground(ctx, logicalW, H);
    drawField(ctx, demo.field, DEMO_AT, { dim: 0.35, alpha });
  } else if (game) {
    game.render(ctx, alpha);
  }
}

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  pollPadPresses((code) => {
    if (menu.active || code === 'Enter') handleKey(code);
  });
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 6) {
    tick(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 6) acc = 0;
  draw(acc / STEP);
  requestAnimationFrame(frame);
}

applyTheme();
fit();
showTitle();
requestAnimationFrame(frame);

// Expose a tiny hook for debugging in the console.
(window as unknown as { slicefall: unknown }).slicefall = {
  get game() {
    return game;
  },
  get demo() {
    return demo;
  },
  resetDemo() {
    demo = new Demo();
  },
};
