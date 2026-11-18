import { pieceShade } from './render';

/** Piece kind per letter of SLICEFALL: Z L O S I J T Z L, red through purple (indices into PIECE_NAMES). */
const LOGO_KINDS = [6, 2, 3, 4, 0, 1, 5, 6, 2];

/**
 * The title logo: every letter in a piece colour, the word sliced along a diagonal and the lower
 * half dropped a little, like a row that was just cut. Two copies of the word are stacked and
 * clipped by the CSS in style.css (.logo-half).
 */
export function logoHtml(): string {
  const letters = [...'SLICEFALL']
    .map((ch, i) => {
      const s = pieceShade(LOGO_KINDS[i]);
      return `<span style="--c:${s.base};--d:${s.dark}">${ch}</span>`;
    })
    .join('');
  return `<span class="logo-half top" aria-hidden="true">${letters}</span><span class="logo-half bottom" aria-hidden="true">${letters}</span>`;
}
