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

/** Key that places an item at `index` among `siblings` (sorted, not containing the item). */
export function positionAt(siblings: { position: string }[], index: number): string {
  const i = Math.max(0, Math.min(index, siblings.length));
  return generateKeyBetween(siblings[i - 1]?.position ?? null, siblings[i]?.position ?? null);
}

/**
 * New key for `activeId` when dropped on `overId` within one sorted list,
 * matching drag-and-drop "arrayMove" semantics: moving down lands after the
 * target, moving up lands before it.
 */
export function reorderPosition<T extends { id: string; position: string }>(
  items: T[],
  activeId: string,
  overId: string,
): string | null {
  const from = items.findIndex((i) => i.id === activeId);
  const to = items.findIndex((i) => i.id === overId);
  if (from < 0 || to < 0 || from === to) return null;
  const rest = items.filter((i) => i.id !== activeId);
  return positionAt(rest, to);
}
