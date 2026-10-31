import type { MingTabDB } from '../db/db';
import { positionBeforeFirst, positionBetween } from '../db/position';
import { createCollection, listAllCardsInOrder, listCards, listCollections } from '../db/repo';
import type { Card } from '../db/schema';

// What the select-mode action bar does with the chosen cards. Every action
// returns an undo, which puts things back as they were (soft deletes and
// updatedAt bumps, so sync carries both the action and its undo).

export type Undo = () => Promise<void>;
export type Mode = 'move' | 'copy';

const now = () => Date.now();
const live = (c: Card) => c.deletedAt === null;

/** The chosen cards that still exist, in board order (space, collection, card). */
export async function selectedInOrder(db: MingTabDB, ids: Iterable<string>): Promise<Card[]> {
  const want = new Set(ids);
  return (await listAllCardsInOrder(db)).filter((c) => want.has(c.id));
}

/**
 * Puts the cards at the end of the target collection, in the order given.
 * Move re-homes them; copy adds new cards and leaves the originals. Copies
 * don't take a shortcut (shortcuts are unique) or a session layout.
 */
export async function placeCards(db: MingTabDB, cards: Card[], targetId: string, mode: Mode): Promise<Undo> {
  return db.transaction('rw', db.cards, async () => {
    let last = (await listCards(db, targetId)).at(-1)?.position ?? null;
    const t = now();
    const before: Pick<Card, 'id' | 'collectionId' | 'position' | 'layout'>[] = [];
    const created: string[] = [];
    for (const c of cards) {
      if (mode === 'move' && c.collectionId === targetId) continue;
      last = positionBetween(last, null);
      if (mode === 'move') {
        before.push({ id: c.id, collectionId: c.collectionId, position: c.position, layout: c.layout ?? null });
        await db.cards.update(c.id, { collectionId: targetId, position: last, layout: null, updatedAt: t });
      } else {
        const copy: Card = {
          id: crypto.randomUUID(),
          createdAt: t,
          updatedAt: t,
          deletedAt: null,
          collectionId: targetId,
          url: c.url,
          title: c.title,
          customTitle: c.customTitle,
          note: c.note,
          favIconUrl: c.favIconUrl,
          position: last,
        };
        await db.cards.add(copy);
        created.push(copy.id);
      }
    }
    return async () => {
      await db.transaction('rw', db.cards, async () => {
        const u = now();
        for (const b of before) await db.cards.update(b.id, { collectionId: b.collectionId, position: b.position, layout: b.layout, updatedAt: u });
        await db.cards.bulkUpdate(created.map((id) => ({ key: id, changes: { deletedAt: u, updatedAt: u } })));
      });
    };
  });
}

/** A new collection, first in its space, holding the cards (moved or copied). */
export async function collectionFromCards(
  db: MingTabDB,
  spaceId: string,
  title: string,
  cards: Card[],
  mode: Mode,
): Promise<{ id: string; undo: Undo }> {
  const { col, undoCards } = await db.transaction('rw', db.collections, db.cards, async () => {
    const first = positionBeforeFirst(await listCollections(db, spaceId));
    const col = await createCollection(db, spaceId, title);
    // Saved windows go first in the space; a collection made from a selection does too.
    await db.collections.update(col.id, { position: first });
    return { col, undoCards: await placeCards(db, cards, col.id, mode) };
  });
  return {
    id: col.id,
    undo: async () => {
      await undoCards();
      const t = now();
      await db.collections.update(col.id, { deletedAt: t, updatedAt: t });
    },
  };
}

/** Soft-deletes the cards; the undo brings them back. */
export async function deleteSelected(db: MingTabDB, cards: Card[]): Promise<Undo> {
  const ids = cards.filter(live).map((c) => c.id);
  const t = now();
  await db.cards.bulkUpdate(ids.map((id) => ({ key: id, changes: { deletedAt: t, updatedAt: t } })));
  return async () => {
    const u = now();
    await db.cards.bulkUpdate(ids.map((id) => ({ key: id, changes: { deletedAt: null, updatedAt: u } })));
  };
}
