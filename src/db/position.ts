import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

// Positions are fractional-index strings: inserting between two items never
// renumbers the rest, which keeps concurrent edits mergeable once sync exists.

export const byPosition = <T extends { position: string }>(a: T, b: T) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/** Key after the last of `items` (or the first key if empty). */
export function positionAfterLast(items: { position: string }[]): string {
  const last = items.reduce<string | null>((max, i) => (max === null || i.position > max ? i.position : max), null);
  return generateKeyBetween(last, null);
}

/** Key before the first of `items`. */
export function positionBeforeFirst(items: { position: string }[]): string {
  const first = items.reduce<string | null>((min, i) => (min === null || i.position < min ? i.position : min), null);
  return generateKeyBetween(null, first);
}

export const positionBetween = (before: string | null, after: string | null) => generateKeyBetween(before, after);

/** `n` ascending keys for a fresh list. */
export const initialPositions = (n: number) => generateNKeysBetween(null, null, n);
