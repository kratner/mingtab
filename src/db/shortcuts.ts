import type { MingTabDB } from './db';
import { displayTitle, type Card } from './schema';

// to/<shortcut>: a short name on a card, typed after the "to" keyword in
// Chrome's address bar. Lowercase letters, digits and - _ . / only.

export class ShortcutError extends Error {}

export function normalizeShortcut(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^to\//, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_./]/g, '');
}

const live = (c: Card) => c.deletedAt === null;

export async function findByShortcut(db: MingTabDB, name: string): Promise<Card | undefined> {
  const key = normalizeShortcut(name);
  if (!key) return undefined;
  return db.cards.filter((c) => live(c) && c.shortcut === key).first();
}

/** Sets (or clears, with '') a card's shortcut. Shortcuts are unique. */
export async function setCardShortcut(db: MingTabDB, cardId: string, input: string): Promise<string> {
  const shortcut = normalizeShortcut(input);
  if (shortcut) {
    const taken = await findByShortcut(db, shortcut);
    if (taken && taken.id !== cardId) throw new ShortcutError(`to/${shortcut} already opens "${displayTitle(taken)}".`);
  }
  await db.cards.update(cardId, { shortcut: shortcut || undefined, updatedAt: Date.now() });
  return shortcut;
}

export interface ShortcutSuggestion {
  shortcut: string | null;
  url: string;
  title: string;
}

/**
 * Address-bar suggestions for what's been typed after "to": shortcuts that
 * start with it first, then other cards whose title contains it.
 */
export async function suggestShortcuts(db: MingTabDB, text: string, limit = 6): Promise<ShortcutSuggestion[]> {
  const q = normalizeShortcut(text);
  const words = text.trim().toLowerCase();
  const cards = await db.cards.filter((c) => live(c) && !!c.url).toArray();
  const byShortcut = cards
    .filter((c) => c.shortcut && (!q || c.shortcut.startsWith(q)))
    .sort((a, b) => a.shortcut!.localeCompare(b.shortcut!));
  // Sorted, so suggestions don't reshuffle between keystrokes (table order is by random id).
  const byTitle = words
    ? cards
        .filter((c) => !byShortcut.includes(c) && displayTitle(c).toLowerCase().includes(words))
        .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)))
    : [];
  return [...byShortcut, ...byTitle]
    .slice(0, limit)
    .map((c) => ({ shortcut: c.shortcut ?? null, url: c.url, title: displayTitle(c) }));
}
