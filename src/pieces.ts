import { BLOCK } from './config';
import type { Poly } from './geometry';

export const PIECE_NAMES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;

// Centres of the four blocks of each piece, relative to the body origin (from newtetrishapes()).
const BLOCK_CENTRES: [number, number][][] = [
  [[-48, 0], [-16, 0], [16, 0], [48, 0]], // I
  [[-32, -16], [0, -16], [32, -16], [32, 16]], // J
  [[-32, -16], [0, -16], [32, -16], [-32, 16]], // L
  [[-16, -16], [-16, 16], [16, 16], [16, -16]], // O
  [[-32, 16], [0, -16], [32, -16], [0, 16]], // S
  [[-32, -16], [0, -16], [32, -16], [0, 16]], // T
  [[0, 16], [0, -16], [32, 16], [-32, -16]], // Z
];

function square(cx: number, cy: number): Poly {
  const h = BLOCK / 2;
  return [
    { x: cx - h, y: cy - h },
    { x: cx + h, y: cy - h },
    { x: cx + h, y: cy + h },
    { x: cx - h, y: cy + h },
  ];
}

export const PIECE_SHAPES: Poly[][] = BLOCK_CENTRES.map((blocks) => blocks.map(([x, y]) => square(x, y)));

/** Centre of mass of each piece in local coordinates (used to spin the preview nicely). */
export const PIECE_CENTRES = BLOCK_CENTRES.map((blocks) => ({
  x: blocks.reduce((s, b) => s + b[0], 0) / 4,
  y: blocks.reduce((s, b) => s + b[1], 0) / 4,
}));

/** Versus mode hands player 1 the mirror image of player 2's piece. */
export const MIRROR = [0, 2, 1, 3, 6, 5, 4];

export function randomKind(): number {
  return Math.floor(Math.random() * 7);
}
