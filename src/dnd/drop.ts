import type { MingTabDB } from '../db/db';
import { positionAfterLast, positionAt, reorderPosition } from '../db/position';
import { addCard, listCards, listCollections, updateCard, updateCollection } from '../db/repo';
import { moveNext } from '../db/next';
import type { Card, Collection, NextItem, Space } from '../db/schema';
import { tabToCard } from '../tabs/tabs';

// What can be dragged, and what it can land on. dnd-kit carries these in
// `active.data` / `over.data`; ids are prefixed by type (see dragId).

export type DragData =
  | { type: 'collection'; collection: Collection }
  | { type: 'card'; card: Card }
  | { type: 'tab'; tab: Pick<chrome.tabs.Tab, 'url' | 'title' | 'favIconUrl'> }
  | { type: 'next'; item: NextItem };

export type DropData =
  | { type: 'collection'; collection: Collection }
  | { type: 'card'; card: Card }
  | { type: 'space'; space: Space }
  | { type: 'next'; item: NextItem };

export const dragId = {
  collection: (id: string) => `collection:${id}`,
  card: (id: string) => `card:${id}`,
  tab: (id: number) => `tab:${id}`,
  space: (id: string) => `space:${id}`,
  next: (id: string) => `next:${id}`,
};

/** Which drop targets each drag type accepts, innermost first. */
export const ACCEPTS: Record<DragData['type'], DropData['type'][]> = {
  collection: ['collection', 'space'],
  card: ['card', 'collection', 'space'],
  tab: ['card', 'collection'],
  next: ['next'],
};

/**
 * Applies a drop to the database. Returns a short description for the
 * status line (and screen readers), or null when nothing changed.
 */
export async function handleDrop(db: MingTabDB, active: DragData, over: DropData): Promise<string | null> {
  if (!ACCEPTS[active.type].includes(over.type)) return null;

  if (active.type === 'next' && over.type === 'next') {
    if (active.item.id === over.item.id) return null;
    await moveNext(db, active.item.id, over.item.id);
    return 'Moved in Next.';
  }
  if (active.type === 'next' || over.type === 'next') return null;

  if (active.type === 'collection') {
    const c = active.collection;
    if (over.type === 'space') {
      if (over.space.id === c.spaceId) return null;
      const position = positionAfterLast(await listCollections(db, over.space.id));
      await updateCollection(db, c.id, { spaceId: over.space.id, position });
      return `Moved "${c.title}" to ${over.space.name}.`;
    }
    if (over.type === 'collection' && over.collection.spaceId === c.spaceId) {
      const position = reorderPosition(await listCollections(db, c.spaceId), c.id, over.collection.id);
      if (!position) return null;
      await updateCollection(db, c.id, { position });
      return `Moved "${c.title}".`;
    }
    return null;
  }

  // Cards and tabs: find the target collection and index.
  let targetId: string;
  let index: number | null = null; // null = append
  if (over.type === 'space') {
    if (active.type !== 'card') return null;
    const cols = await listCollections(db, over.space.id);
    if (cols.length === 0) return null;
    targetId = cols[0]!.id;
  } else if (over.type === 'collection') {
    targetId = over.collection.id;
  } else {
    targetId = over.card.collectionId;
    const siblings = await listCards(db, targetId);
    index = siblings.findIndex((s) => s.id === over.card.id);
  }

  if (active.type === 'tab') {
    const card = await addCard(db, targetId, tabToCard(active.tab));
    if (index !== null) {
      const siblings = (await listCards(db, targetId)).filter((s) => s.id !== card.id);
      await updateCard(db, card.id, { position: positionAt(siblings, index) });
    }
    return `Saved "${card.title}".`;
  }

  const card = active.card;
  const siblings = await listCards(db, targetId);
  let position: string | null;
  if (targetId === card.collectionId) {
    position = over.type === 'card' ? reorderPosition(siblings, card.id, over.card.id) : null;
  } else {
    const rest = siblings.filter((s) => s.id !== card.id);
    position = index === null ? positionAfterLast(rest) : positionAt(rest, index);
  }
  if (!position) return null;
  await updateCard(db, card.id, { collectionId: targetId, position });
  return targetId === card.collectionId ? 'Moved card.' : 'Moved card to another collection.';
}
