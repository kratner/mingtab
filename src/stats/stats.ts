import { hostOf } from '../app/favicon';
import type { MingTabDB } from '../db/db';
import type { Card, Collection, Space } from '../db/schema';
import { extraCopies, findDuplicates } from '../dedupe/dedupe';

// Counts for the board: the totals under the space list, the tab count in a
// space's header, and the Stats view. Everything is counted from live records
// in the spaces shown on this device (hidden spaces still sync but aren't counted).

export interface CollectionSize {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
  tabs: number;
}

export interface BoardStats {
  spaces: number;
  collections: number;
  /** Saved pages (cards with a URL). */
  tabs: number;
  /** Note cards (cards without a URL). */
  notes: number;
  /** Saved pages that carry a note of their own. */
  tabsWithNotes: number;
  /** Cards that would go if each duplicated page kept one copy. */
  duplicates: number;
  emptyCollections: number;
  biggest: CollectionSize[];
  topSites: { host: string; tabs: number }[];
}

const live = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;

/** Cards are expected in board order, so the duplicate count matches Settings → Duplicates. */
export function computeStats(spaces: Space[], collections: Collection[], cards: Card[], top = 5): BoardStats {
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
  const cols = collections.filter((c) => live(c) && spaceName.has(c.spaceId));
  const colIds = new Set(cols.map((c) => c.id));
  const mine = cards.filter((c) => live(c) && colIds.has(c.collectionId));
  const tabs = mine.filter((c) => c.url);

  const perCollection = new Map<string, number>();
  for (const c of tabs) perCollection.set(c.collectionId, (perCollection.get(c.collectionId) ?? 0) + 1);
  const withCards = new Set(mine.map((c) => c.collectionId));

  const sites = new Map<string, number>();
  for (const c of tabs) {
    const h = hostOf(c.url);
    if (h) sites.set(h, (sites.get(h) ?? 0) + 1);
  }

  return {
    spaces: spaces.length,
    collections: cols.length,
    tabs: tabs.length,
    notes: mine.length - tabs.length,
    tabsWithNotes: tabs.filter((c) => c.note.trim()).length,
    duplicates: extraCopies(findDuplicates(tabs)),
    emptyCollections: cols.filter((c) => !withCards.has(c.id)).length,
    biggest: cols
      .map((c) => ({ id: c.id, spaceId: c.spaceId, spaceName: spaceName.get(c.spaceId)!, title: c.title, tabs: perCollection.get(c.id) ?? 0 }))
      .filter((c) => c.tabs > 0)
      .sort((a, b) => b.tabs - a.tabs || a.title.localeCompare(b.title))
      .slice(0, top),
    topSites: [...sites.entries()]
      .map(([host, n]) => ({ host, tabs: n }))
      .sort((a, b) => b.tabs - a.tabs || a.host.localeCompare(b.host))
      .slice(0, top),
  };
}

/** Saved pages in the given collections. */
export const countTabs = (db: MingTabDB, collectionIds: string[]) =>
  db.cards
    .where('collectionId')
    .anyOf(collectionIds)
    .filter((c) => live(c) && !!c.url)
    .count();

/** Stats for the given spaces, cards in board order. */
export async function loadStats(db: MingTabDB, spaces: Space[], top?: number): Promise<BoardStats> {
  const cols = (await db.collections.where('spaceId').anyOf(spaces.map((s) => s.id)).toArray())
    .filter(live)
    .sort((a, b) => spaces.findIndex((s) => s.id === a.spaceId) - spaces.findIndex((s) => s.id === b.spaceId) || (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  const order = new Map(cols.map((c, i) => [c.id, i]));
  const cards = (await db.cards.where('collectionId').anyOf([...order.keys()]).toArray())
    .filter(live)
    .sort((a, b) => order.get(a.collectionId)! - order.get(b.collectionId)! || (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  return computeStats(spaces, cols, cards, top);
}

/** Collections and saved pages across the given spaces: the totals under the space list. */
export async function loadTotals(db: MingTabDB, spaceIds: string[]): Promise<{ collections: number; tabs: number }> {
  const cols = await db.collections.where('spaceId').anyOf(spaceIds).filter(live).primaryKeys();
  return { collections: cols.length, tabs: await countTabs(db, cols) };
}
