import { audio } from './audio';
import * as C from './config';
import { Field, type FieldEvent, NO_CONTROLS } from './field';
import { singleControls, versusControls } from './input';
import { MIRROR, randomKind } from './pieces';
import { COLORS, FONT, card, drawBackground, drawField, drawPreview, label, value } from './render';
import { highScores, type ScoredMode } from './storage';

export const H = 640;
export const SINGLE_W = 620;
export const VERSUS_W = 940;
export const SINGLE_FIELD = { x: 56, y: 32 };

/** Where the HTML pause button sits, in logical canvas pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function eventSound(e: FieldEvent) {
  switch (e) {
    case 'land':
      audio.play('land');
      break;
    case 'clear':
      audio.play('clear');
      break;
    case 'clear4':
      audio.play('clear4');
      break;
    case 'levelup':
      audio.play('levelup');
      break;
    default:
      break;
  }
}

export class SingleGame {
  readonly type = 'single';
  readonly field: Field;
  readonly best: number;
  readonly pauseRect: Rect = { x: 410, y: 520, w: 186, h: 38 };
  paused = false;
  /** Seconds of actual play (not paused, not the game-over fall), sent with the score. */
  elapsed = 0;

  constructor(
    readonly mode: ScoredMode,
    private onOver: () => void,
  ) {
    this.field = new Field({ mode, pickKind: randomKind, emit: (e) => this.onEvent(e) });
    this.best = highScores(mode)[0]?.score ?? 0;
  }

  get width() {
    return SINGLE_W;
  }

  start() {
    this.field.start();
  }

  private onEvent(e: FieldEvent) {
    eventSound(e);
    if (e === 'topout') {
      audio.stopMusic();
      audio.play('topout');
      this.field.startFallout();
    } else if (e === 'fallout') {
      audio.play('fallout');
    } else if (e === 'over') {
      this.onOver();
    }
  }

  update(dt: number) {
    if (this.paused) return;
    if (this.field.state === 'playing' || this.field.state === 'cutting') this.elapsed += dt;
    this.field.update(dt, singleControls());
  }

  render(ctx: CanvasRenderingContext2D) {
    const f = this.field;
    drawBackground(ctx, SINGLE_W, H);
    drawField(ctx, f, SINGLE_FIELD, { hidePieces: this.paused });

    const px = 410;
    const pw = 186;
    const cx = px + pw / 2;

    card(ctx, px, 32, pw, 290);
    label(ctx, 'Score', px + 18, 66);
    value(ctx, String(f.score), px + 18, 104, 34);
    if (f.addTimer < C.SCORE_POPUP_TIME && !f.isCutting() && f.lastAdd > 0) {
      const t = f.addTimer / C.SCORE_POPUP_TIME;
      ctx.globalAlpha = 1 - t;
      value(ctx, `+${f.lastAdd}`, px + pw - 16, 66 - t * 14, 18, 'right', COLORS.accent);
      ctx.globalAlpha = 1;
    }
    if (this.mode === 'cut') {
      label(ctx, 'Level', px + 18, 150);
      value(ctx, String(f.level), px + 18, 186, 30);
      label(ctx, 'Lines', px + 18, 232);
      value(ctx, String(f.lines), px + 18, 268, 30);
    } else {
      label(ctx, 'Pieces', px + 18, 150);
      value(ctx, String(f.placed), px + 18, 186, 30);
    }
    label(ctx, 'Best', px + 18, 300);
    value(ctx, String(Math.max(this.best, f.score)), px + pw - 18, 300, 16, 'right', COLORS.dim);

    card(ctx, px, 338, pw, 170);
    label(ctx, 'Next', px + 18, 368);
    if (!this.paused) drawPreview(ctx, f.nextKind, cx, 438, f.nextSpin, 0.78);

    // The pause button itself is an HTML element over pauseRect; key hints go under it.
    ctx.fillStyle = COLORS.dim;
    ctx.font = `600 12px ${FONT}`;
    ctx.textAlign = 'left';
    const hints = [
      ['← →  move', '↓  push'],
      ['Z X  rotate', 'M  mute'],
    ];
    hints.forEach(([a, b], i) => {
      ctx.fillText(a, px + 18, 580 + i * 18);
      ctx.fillText(b, px + 112, 580 + i * 18);
    });
  }
}

type VersusPhase = 'countdown' | 'playing' | 'ending' | 'fallout' | 'done';

export class VersusGame {
  readonly type = 'versus';
  static wins: [number, number] = [0, 0];

  readonly fields: [Field, Field];
  readonly pauseRect: Rect = { x: 390, y: 516, w: 168, h: 36 };
  phase: VersusPhase = 'countdown';
  paused = false;
  winner: 0 | 1 | 2 = 2; // 2 = draw
  private seq: number[] = [];
  private countdown = 3;
  private lastBeep = 4;
  private endTimer = 0;
  private static readonly AT = [
    { x: 40, y: 32 },
    { x: 580, y: 32 },
  ];

  constructor(
    private onStart: () => void,
    private onDone: () => void,
  ) {
    // Both players get the same sequence; player 1 gets every piece mirrored (as in the original).
    const picker = (player: 0 | 1) => {
      let i = 0;
      return () => {
        while (this.seq.length <= i) this.seq.push(randomKind());
        const k = this.seq[i++];
        return player === 0 ? MIRROR[k] : k;
      };
    };
    this.fields = [
      new Field({ mode: 'stack', pickKind: picker(0), emit: (e) => this.onEvent(0, e) }),
      new Field({ mode: 'stack', pickKind: picker(1), emit: (e) => this.onEvent(1, e) }),
    ];
  }

  get width() {
    return VERSUS_W;
  }

  start() {
    /* countdown runs in update() */
  }

  private onEvent(player: 0 | 1, e: FieldEvent) {
    if (e === 'land') audio.play('land');
    else if (e === 'topout') audio.play('back');
    else if (e === 'fallout' && player === 0) audio.play('fallout');
  }

  update(dt: number) {
    if (this.paused) return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastBeep && n > 0) audio.play('beep');
      this.lastBeep = n;
      if (this.countdown <= 0) {
        this.phase = 'playing';
        audio.play('go');
        this.fields.forEach((f) => f.start());
        this.onStart();
      }
      return;
    }

    this.fields[0].update(dt, this.phase === 'playing' ? versusControls(0) : NO_CONTROLS);
    this.fields[1].update(dt, this.phase === 'playing' ? versusControls(1) : NO_CONTROLS);

    if (this.phase === 'playing') {
      if (this.fields.every((f) => f.state === 'toppedOut')) {
        const [a, b] = this.fields.map((f) => f.placed);
        const w = a > b ? 0 : b > a ? 1 : 2;
        this.winner = w;
        if (w !== 2) VersusGame.wins[w] = (VersusGame.wins[w] + 1) % 100;
        this.phase = 'ending';
        this.endTimer = 0;
        audio.stopMusic();
        audio.play('topout');
      }
    } else if (this.phase === 'ending') {
      this.endTimer += dt;
      if (this.endTimer > 1.6) {
        this.fields.forEach((f) => f.startFallout());
        this.phase = 'fallout';
      }
    } else if (this.phase === 'fallout') {
      if (this.fields.every((f) => f.state === 'over')) {
        this.phase = 'done';
        this.onDone();
      }
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    drawBackground(ctx, VERSUS_W, H);
    this.fields.forEach((f, i) => {
      const at = VersusGame.AT[i];
      const out = f.state === 'toppedOut' && this.phase === 'playing';
      drawField(ctx, f, at, { hidePieces: this.paused, dim: out ? 0.55 : 0 });
      if (out) centreText(ctx, 'TOPPED OUT', at.x + f.width / 2, at.y + C.FIELD_HEIGHT / 2, 26, COLORS.danger);
      if (this.phase === 'countdown') {
        centreText(ctx, String(Math.max(1, Math.ceil(this.countdown))), at.x + f.width / 2, at.y + C.FIELD_HEIGHT / 2, 110, COLORS.accent);
      }
    });

    // Centred between the fields, clear of the Retro brick walls (16 px each side of a field)
    const px = 390;
    const pw = 168;
    const cx = px + pw / 2;
    for (let i = 0; i < 2; i++) {
      const f = this.fields[i];
      const y = 32 + i * 200;
      card(ctx, px, y, pw, 184);
      label(ctx, `Player ${i + 1}`, cx, y + 30, 'center');
      value(ctx, String(f.placed), cx, y + 76, 40, 'center');
      label(ctx, 'pieces', cx, y + 96, 'center');
      if (!this.paused && this.phase !== 'countdown') drawPreview(ctx, f.nextKind, cx, y + 140, f.nextSpin, 0.55);
    }
    card(ctx, px, 432, pw, 72);
    label(ctx, 'Wins', cx, 458, 'center');
    value(ctx, `${VersusGame.wins[0]}  –  ${VersusGame.wins[1]}`, cx, 492, 26, 'center');

    ctx.fillStyle = COLORS.dim;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ['P1  A D S  ·  Q E rotate', 'P2  J L K  ·  U O rotate', '(P2 also ← → ↓  ·  , .)'].forEach((h, i) =>
      ctx.fillText(h, cx, 572 + i * 16),
    );
  }
}

export function centreText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string = COLORS.text) {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(4, size / 7);
  ctx.strokeStyle = `rgba(${COLORS.veil}, 0.85)`;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textBaseline = 'alphabetic';
}
