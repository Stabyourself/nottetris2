import * as C from './config';
import type { Field, PieceView } from './field';
import { type Poly, shrinkPolygon } from './geometry';
import { PIECE_CENTRES, PIECE_SHAPES } from './pieces';
import type { ThemeName } from './storage';

interface Palette {
  bg: string;
  bgGlow: string;
  field: string;
  fieldStripe: string;
  frame: string;
  text: string;
  dim: string;
  accent: string;
  danger: string;
  /** HUD card fill and outline */
  card: string;
  cardLine: string;
  /** Row meter: empty slot, then the gauge from barely filled to nearly full (hex, they get mixed) */
  meter: string;
  meterLow: string;
  meterHigh: string;
  /** Rows lighting up just before they are cut */
  flash: string;
  /** "r, g, b" laid over a field to dim it, and around big centred text */
  veil: string;
}

/** Block colours: the outer edge, the body, and a smaller square inside it. */
interface Shade {
  dark: string;
  base: string;
  light: string;
}

/**
 * Pixel art drawn in place of the smooth blocks and frame. Each map is rows of digits, one digit
 * per art pixel, indexing into `tones`; an art pixel is PIXEL logical px square.
 */
interface PixelArt {
  tones: string[];
  /** One 8×8 block per piece kind, in PIECE_NAMES order */
  blocks: string[][];
  /** Tile for the brick walls either side of the well, WALL px wide */
  wall: string[];
  /** Tile for the brick floor under the well, WALL px tall */
  floor: string[];
}

interface Theme {
  colors: Palette;
  /** One shade per piece kind, in PIECE_NAMES order */
  pieces: Shade[];
  /** Opacity of the inner square of each block */
  inner: number;
  /** Corner radius of the HUD cards (the well frame is 2 px tighter) */
  radius: number;
  /** Outline width of the HUD cards */
  stroke: number;
  font: string;
  /** Pixel-art blocks and a brick well instead of smooth blocks and a plain frame */
  pixel?: PixelArt;
}

const PIXEL = 4;
/** Thickness of the brick walls and floor */
const WALL = 4 * PIXEL;

// One hue per piece kind, in PIECE_NAMES order (I J L O S T Z), following the usual
// convention of modern block games: I cyan, J blue, L orange, O yellow, S green, T purple, Z red.
const PIECE_BASE = ['#2fd4d4', '#4a78ff', '#ff8c2e', '#ffd23f', '#5fd35b', '#b452e8', '#f0444f'];

const MODERN: Theme = {
  colors: {
    bg: '#0d1020',
    bgGlow: '#161b36',
    field: '#141831',
    fieldStripe: '#171c38',
    frame: '#2b3366',
    text: '#eef1ff',
    dim: '#8890c0',
    accent: '#ffd34d',
    danger: '#ff5c7a',
    card: 'rgba(30, 36, 74, 0.75)',
    cardLine: 'rgba(120, 132, 220, 0.25)',
    meter: '#1b2042',
    meterLow: '#3a4380',
    meterHigh: '#9aa6ff',
    flash: 'rgba(255, 246, 214, 0.92)',
    veil: '8, 10, 22',
  },
  pieces: PIECE_BASE.map((hex) => ({ dark: mix(hex, '#000000', 0.45), base: hex, light: mix(hex, '#ffffff', 0.35) })),
  inner: 0.35,
  radius: 12,
  stroke: 1.5,
  font: '"Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif',
};

// Retro: a four-tone monochrome screen in plain greys. Blocks are 8×8 pixel art, each piece kind
// with its own pattern, and the well stands between brick walls.
const INK = '#24261f';
const DARK = '#5a5d4e';
const MID = '#8f9380';
const LIGHT = '#c2c5b2';
const PALE = '#e0e2d2';

// Digits: 0 ink, 1 dark, 2 mid, 3 light, 4 pale. Every block has an ink rim, so neighbouring
// blocks read as separate squares and cut edges still show which piece they came from.
const RETRO_BLOCKS: string[][] = [
  // I: bevelled mid
  ['00000000', '03333310', '03222210', '03222210', '03222210', '03222210', '01111110', '00000000'],
  // J: dark with a light centre
  ['00000000', '01111110', '01111110', '01133110', '01133110', '01111110', '01111110', '00000000'],
  // L: light with a dark ring
  ['00000000', '03333330', '03111130', '03133130', '03133130', '03111130', '03333330', '00000000'],
  // O: checkerboard
  ['00000000', '02323230', '03232320', '02323230', '03232320', '02323230', '03232320', '00000000'],
  // S: diagonal stripes
  ['00000000', '02211220', '02112210', '01122110', '01221120', '02211220', '02112210', '00000000'],
  // T: light with a mid centre
  ['00000000', '03333330', '03322330', '03222230', '03222230', '03322330', '03333330', '00000000'],
  // Z: mid with four rivets
  ['00000000', '02222220', '02122120', '02222220', '02222220', '02122120', '02222220', '00000000'],
];

const RETRO: Theme = {
  colors: {
    bg: '#b3b6a3',
    bgGlow: '#bfc2af',
    field: PALE,
    fieldStripe: PALE,
    frame: INK,
    text: INK,
    dim: '#55584a',
    accent: INK,
    danger: INK,
    card: 'rgba(224, 226, 210, 0.92)',
    cardLine: INK,
    meter: '#cbcdbb',
    meterLow: '#a3a794',
    meterHigh: DARK,
    flash: 'rgba(36, 38, 31, 0.92)',
    veil: '224, 226, 210',
  },
  // Only used if something asks for a piece colour (the logo is styled in CSS for this theme)
  pieces: RETRO_BLOCKS.map(() => ({ dark: INK, base: MID, light: LIGHT })),
  inner: 1,
  radius: 0,
  stroke: PIXEL,
  font: '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace',
  pixel: {
    tones: [INK, DARK, MID, LIGHT, PALE],
    blocks: RETRO_BLOCKS,
    // Stretcher bond seen through the narrow wall: dark mortar, a light top edge, mid faces, and
    // the vertical joints of alternate courses offset by two pixels
    wall: ['1111', '3331', '2221', '2221', '1111', '3133', '2122', '2122'],
    floor: ['11111111', '33333331', '22222221', '22222221'],
  },
};

const THEMES: Record<ThemeName, Theme> = { modern: MODERN, retro: RETRO };

let theme = MODERN;
/** Colours of the current theme. Mutated in place by setTheme, so keep reading it at draw time. */
export const COLORS: Palette = { ...MODERN.colors };
export let FONT = MODERN.font;

/** Switches the canvas drawing to another look. Unknown names fall back to the default. */
export function setTheme(name: ThemeName) {
  theme = THEMES[name] ?? MODERN;
  Object.assign(COLORS, theme.colors);
  FONT = theme.font;
  patterns.clear();
}

// ------------------------------------------------------------------ pixel art

const patterns = new Map<string, CanvasPattern>();

/** A repeating fill made from a pixel map, cached per key until the theme changes. */
function artPattern(ctx: CanvasRenderingContext2D, key: string, rows: string[], tones: string[], ox = 0, oy = 0): CanvasPattern {
  let p = patterns.get(key);
  if (!p) {
    const c = document.createElement('canvas');
    c.width = rows[0].length * PIXEL;
    c.height = rows.length * PIXEL;
    const g = c.getContext('2d')!;
    rows.forEach((row, y) =>
      [...row].forEach((d, x) => {
        g.fillStyle = tones[Number(d)];
        g.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
      }),
    );
    p = ctx.createPattern(c, 'repeat')!;
    p.setTransform(new DOMMatrix().translate(ox, oy));
    patterns.set(key, p);
  }
  return p;
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

/**
 * Block pattern of a piece kind, lined up with that kind's block grid in body coordinates. Cut
 * pieces keep their body frame (see Field.removeRow), so a sliced block keeps its texture in place.
 */
function blockPattern(ctx: CanvasRenderingContext2D, art: PixelArt, kind: number): CanvasPattern {
  const corner = PIECE_SHAPES[kind][0][0];
  return artPattern(ctx, `block${kind}`, art.blocks[kind], art.tones, mod(corner.x, C.BLOCK), mod(corner.y, C.BLOCK));
}

/** Fills a rectangle with a pixel map, starting the map at its top-left corner. */
function fillArt(ctx: CanvasRenderingContext2D, key: string, rows: string[], art: PixelArt, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = artPattern(ctx, key, rows, art.tones);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Colours of one piece kind (index into PIECE_NAMES), e.g. for the logo. */
export function pieceShade(kind: number): Readonly<Shade> {
  return theme.pieces[kind];
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

function drawBlockShape(ctx: CanvasRenderingContext2D, shape: Poly, kind: number) {
  const shade = theme.pieces[kind];
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
    ctx.globalAlpha = theme.inner;
    pathPoly(ctx, hi);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Draws a piece's blocks in body coordinates (the caller sets up the transform). */
function drawBlocks(ctx: CanvasRenderingContext2D, shapes: Poly[], kind: number) {
  const art = theme.pixel;
  if (!art) {
    for (const s of shapes) drawBlockShape(ctx, s, kind);
    return;
  }
  // One path for the whole piece, so the edges between its blocks get no anti-aliasing seams
  ctx.beginPath();
  for (const p of shapes) {
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
  }
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = blockPattern(ctx, art, kind);
  ctx.fill();
}

export function drawPieceView(ctx: CanvasRenderingContext2D, v: PieceView) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.angle);
  drawBlocks(ctx, v.shapes, v.kind);
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

  // Frame (or brick walls and floor) + well
  ctx.save();
  const art = theme.pixel;
  if (art) {
    fillArt(ctx, 'wall', art.wall, art, at.x - WALL, at.y, WALL, h);
    fillArt(ctx, 'wall', art.wall, art, at.x + w, at.y, WALL, h);
    fillArt(ctx, 'floor', art.floor, art, at.x - WALL, at.y + h, w + 2 * WALL, WALL);
  } else {
    ctx.fillStyle = COLORS.frame;
    roundRect(ctx, at.x - 6, at.y - 6, w + 12, h + 12, Math.max(0, theme.radius - 2));
    ctx.fill();
  }
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
      ctx.fillStyle = COLORS.flash;
      for (let r = 0; r < C.ROWS; r++) {
        if (field.removedRows[r]) ctx.fillRect(field.left, r * C.BLOCK, w, C.BLOCK);
      }
    }
  }
  ctx.restore();

  if (opts.dim) {
    ctx.fillStyle = `rgba(${COLORS.veil}, ${opts.dim})`;
    ctx.fillRect(at.x, at.y, w, h);
  }

  if (field.mode === 'cut') drawRowMeter(ctx, field, at);
}

/** Per-row fill gauge left of the well: how close each row is to being cut. */
function drawRowMeter(ctx: CanvasRenderingContext2D, field: Field, at: FieldLayout) {
  // 8 px clear of the frame or wall; in pixel art every edge lands on the pixel grid
  const art = theme.pixel;
  const mw = 12;
  const mx = at.x - (art ? WALL : 6) - 8 - mw;
  const pad = art ? PIXEL : 3;
  for (let r = 0; r < C.ROWS; r++) {
    const y = at.y + r * C.BLOCK + pad;
    const hh = C.BLOCK - 2 * pad;
    ctx.fillStyle = COLORS.meter;
    ctx.fillRect(mx, y, mw, hh);
    const f = field.rowFullness(r);
    if (f <= 0) continue;
    ctx.fillStyle = f >= 1 ? COLORS.accent : mix(COLORS.meterLow, COLORS.meterHigh, f);
    const fh = art ? Math.max(PIXEL, Math.round((hh * f) / PIXEL) * PIXEL) : Math.max(1, Math.round(hh * f));
    ctx.fillRect(mx, y + hh - fh, mw, fh);
  }
}

export function drawPreview(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, angle: number, scale = 0.8) {
  const c = PIECE_CENTRES[kind];
  // Pixel art keeps whole logical pixels per art pixel (0.78 -> 3 px, 0.55 -> 2 px)
  if (theme.pixel) scale = Math.round(scale * PIXEL) / PIXEL;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.rotate(angle);
  ctx.translate(-c.x, -c.y);
  drawBlocks(ctx, PIECE_SHAPES[kind], kind);
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
  ctx.fillStyle = COLORS.card;
  roundRect(ctx, x, y, w, h, theme.radius);
  ctx.fill();
  ctx.strokeStyle = COLORS.cardLine;
  ctx.lineWidth = theme.stroke;
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
