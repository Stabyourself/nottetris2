import * as C from './config';
import type { Field, PieceView } from './field';
import { type Poly, shrinkPolygon } from './geometry';
import { PIECE_CENTRES, PIECE_SHAPES } from './pieces';

export const COLORS = {
  bg: '#0d1020',
  bgGlow: '#161b36',
  field: '#141831',
  fieldStripe: '#171c38',
  frame: '#2b3366',
  text: '#eef1ff',
  dim: '#8890c0',
  accent: '#ffd34d',
  danger: '#ff5c7a',
};

// One hue per piece kind, in PIECE_NAMES order (I J L O S T Z), following the usual
// convention of modern block games: I cyan, J blue, L orange, O yellow, S green, T purple, Z red.
const PIECE_BASE = ['#2fd4d4', '#4a78ff', '#ff8c2e', '#ffd23f', '#5fd35b', '#b452e8', '#f0444f'];

interface Shade {
  dark: string;
  base: string;
  light: string;
}
const SHADES: Shade[] = PIECE_BASE.map((hex) => ({ dark: mix(hex, '#000000', 0.45), base: hex, light: mix(hex, '#ffffff', 0.35) }));

/** Colours of one piece kind (index into PIECE_NAMES), e.g. for the logo. */
export function pieceShade(kind: number): Readonly<Shade> {
  return SHADES[kind];
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `rgb(${m(16)}, ${m(8)}, ${m(0)})`;
}

export interface FieldLayout {
  x: number;
  y: number;
}

export const FONT = '"Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif';

// Inset outlines are cached per polygon; cut pieces get fresh polygon objects so this stays valid.
const insetCache = new WeakMap<Poly, { mid: Poly | null; hi: Poly | null }>();
function insets(p: Poly) {
  let v = insetCache.get(p);
  if (!v) {
    v = { mid: shrinkPolygon(p, 2.5), hi: shrinkPolygon(p, 7) };
    insetCache.set(p, v);
  }
  return v;
}

function pathPoly(ctx: CanvasRenderingContext2D, p: Poly) {
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
}

export function drawBlockShape(ctx: CanvasRenderingContext2D, shape: Poly, kind: number) {
  const shade = SHADES[kind];
  const { mid, hi } = insets(shape);
  ctx.fillStyle = shade.dark;
  pathPoly(ctx, shape);
  ctx.fill();
  if (mid) {
    ctx.fillStyle = shade.base;
    pathPoly(ctx, mid);
    ctx.fill();
  }
  if (hi) {
    ctx.fillStyle = shade.light;
    ctx.globalAlpha = 0.35;
    pathPoly(ctx, hi);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawPieceView(ctx: CanvasRenderingContext2D, v: PieceView) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  for (const s of v.shapes) drawBlockShape(ctx, s, v.kind);
  ctx.restore();
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 40, w * 0.5, h * 0.35, Math.max(w, h) * 0.8);
  g.addColorStop(0, COLORS.bgGlow);
  g.addColorStop(1, COLORS.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

interface FieldDrawOpts {
  hidePieces?: boolean;
  dim?: number;
}

export function drawField(ctx: CanvasRenderingContext2D, field: Field, at: FieldLayout, opts: FieldDrawOpts = {}) {
  const w = field.width;
  const h = C.FIELD_HEIGHT;

  // Frame + well
  ctx.save();
  ctx.fillStyle = COLORS.frame;
  roundRect(ctx, at.x - 6, at.y - 6, w + 12, h + 12, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(at.x, at.y, w, h);
  ctx.fillStyle = COLORS.fieldStripe;
  for (let r = 0; r < C.ROWS; r += 2) ctx.fillRect(at.x, at.y + r * C.BLOCK, w, C.BLOCK);

  ctx.beginPath();
  ctx.rect(at.x, at.y, w, h);
  ctx.clip();
  ctx.translate(at.x - field.left, at.y);

  if (!opts.hidePieces) {
    const cutting = field.isCutting();
    const views = cutting ? field.snapshot : field.views();
    for (const v of views) drawPieceView(ctx, v);

    if (cutting && field.rowsLit()) {
      ctx.fillStyle = 'rgba(255, 246, 214, 0.92)';
      for (let r = 0; r < C.ROWS; r++) {
        if (field.removedRows[r]) ctx.fillRect(field.left, r * C.BLOCK, w, C.BLOCK);
      }
    }
  }
  ctx.restore();

  if (opts.dim) {
    ctx.fillStyle = `rgba(8, 10, 22, ${opts.dim})`;
    ctx.fillRect(at.x, at.y, w, h);
  }

  if (field.mode === 'cut') drawRowMeter(ctx, field, at);
}

/** Per-row fill gauge left of the well: how close each row is to being cut. */
function drawRowMeter(ctx: CanvasRenderingContext2D, field: Field, at: FieldLayout) {
  const mx = at.x - 26;
  const mw = 12;
  for (let r = 0; r < C.ROWS; r++) {
    const y = at.y + r * C.BLOCK + 3;
    const hh = C.BLOCK - 6;
    ctx.fillStyle = '#1b2042';
    ctx.fillRect(mx, y, mw, hh);
    const f = field.rowFullness(r);
    if (f <= 0) continue;
    ctx.fillStyle = f >= 1 ? COLORS.accent : mix('#3a4380', '#9aa6ff', f);
    const fh = Math.max(1, Math.round(hh * f));
    ctx.fillRect(mx, y + hh - fh, mw, fh);
  }
}

export function drawPreview(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, angle: number, scale = 0.8) {
  const c = PIECE_CENTRES[kind];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.rotate(angle);
  ctx.translate(-c.x, -c.y);
  for (const s of PIECE_SHAPES[kind]) drawBlockShape(ctx, s, kind);
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(30, 36, 74, 0.75)';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 132, 220, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'left') {
  ctx.fillStyle = COLORS.dim;
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text.toUpperCase().split('').join(' '), x, y);
}

export function value(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 30, align: CanvasTextAlign = 'left', color = COLORS.text) {
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}
