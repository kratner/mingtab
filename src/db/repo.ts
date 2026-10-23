import type { MingTabDB } from './db';
import { initialPositions, positionAfterLast, positionBeforeFirst, positionBetween } from './position';
import type { Card, Collection, Space } from './schema';

const now = () => Date.now();
const uuid = () => crypto.randomUUID();
const live = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;

function base() {
  const t = now();
  return { id: uuid(), createdAt: t, updatedAt: t, deletedAt: null };
}

// ---- reads ---------------------------------------------------------------

export const listSpaces = (db: MingTabDB) => db.spaces.orderBy('position').filter(live).toArray();

export const listCollections = (db: MingTabDB, spaceId: string) =>
  db.collections
    .where('[spaceId+position]')
    .between([spaceId, ''], [spaceId, '￿'])
    .filter(live)
    .toArray();

export const listCards = (db: MingTabDB, collectionId: string) =>
  db.cards
    .where('[collectionId+position]')
    .between([collectionId, ''], [collectionId, '￿'])
    .filter(live)
    .toArray();

// ---- spaces --------------------------------------------------------------

export async function createSpace(db: MingTabDB, name: string): Promise<Space> {
  const space: Space = { ...base(), name, position: positionAfterLast(await listSpaces(db)) };
  await db.spaces.add(space);
  return space;
}

export const renameSpace = (db: MingTabDB, id: string, name: string) =>
  db.spaces.update(id, { name, updatedAt: now() });

/** Soft-deletes the space and everything in it. */
export async function deleteSpace(db: MingTabDB, id: string) {
  const t = now();
  await db.transaction('rw', db.spaces, db.collections, db.cards, async () => {
    const cols = await db.collections.where('spaceId').equals(id).filter(live).toArray();
    for (const c of cols) await softDeleteCollection(db, c.id, t);
    await db.spaces.update(id, { deletedAt: t, updatedAt: t });
  });
}

// ---- collections ---------------------------------------------------------

export async function createCollection(db: MingTabDB, spaceId: string, title: string): Promise<Collection> {
  const collection: Collection = {
    ...base(),
    spaceId,
    title,
    position: positionAfterLast(await listCollections(db, spaceId)),
    starred: false,
    collapsed: false,
    tagIds: [],
  };
  await db.collections.add(collection);
  return collection;
}

/**
 * Creates a collection already filled with cards, in one transaction. Used
 * when saving windows and tab groups; `atTop` puts it first in the space.
 */
export async function createCollectionWithCards(
  db: MingTabDB,
  spaceId: string,
  title: string,
  cards: NewCard[],
  opts: { atTop?: boolean; groupColor?: string | null } = {},
): Promise<Collection> {
  return db.transaction('rw', db.collections, db.cards, async () => {
    const siblings = await listCollections(db, spaceId);
    const collection: Collection = {
      ...base(),
      spaceId,
      title,
      position: opts.atTop ? positionBeforeFirst(siblings) : positionAfterLast(siblings),
      starred: false,
      collapsed: false,
      tagIds: [],
      groupColor: opts.groupColor ?? null,
    };
    await db.collections.add(collection);
    const positions = initialPositions(cards.length);
    await db.cards.bulkAdd(
      cards.map((c, i) => ({
        ...base(),
        collectionId: collection.id,
        url: c.url,
        title: c.title ?? '',
        customTitle: c.customTitle ?? '',
        note: c.note ?? '',
        favIconUrl: c.favIconUrl ?? '',
        position: positions[i]!,
      })),
    );
    return collection;
  });
}

export const updateCollection = (
  db: MingTabDB,
  id: string,
  changes: Partial<Pick<Collection, 'title' | 'starred' | 'collapsed' | 'tagIds' | 'spaceId' | 'position' | 'groupColor'>>,
) => db.collections.update(id, { ...changes, updatedAt: now() });

async function softDeleteCollection(db: MingTabDB, id: string, t: number) {
  await db.cards.where('collectionId').equals(id).filter(live).modify({ deletedAt: t, updatedAt: t });
  await db.collections.update(id, { deletedAt: t, updatedAt: t });
}

export const deleteCollection = (db: MingTabDB, id: string) =>
  db.transaction('rw', db.collections, db.cards, () => softDeleteCollection(db, id, now()));

// ---- cards ---------------------------------------------------------------

export interface NewCard {
  url: string;
  title?: string;
  customTitle?: string;
  note?: string;
  favIconUrl?: string;
}

export async function addCard(db: MingTabDB, collectionId: string, input: NewCard): Promise<Card> {
  const card: Card = {
    ...base(),
    collectionId,
    url: input.url,
    title: input.title ?? '',
    customTitle: input.customTitle ?? '',
    note: input.note ?? '',
    favIconUrl: input.favIconUrl ?? '',
    position: positionAfterLast(await listCards(db, collectionId)),
  };
  await db.cards.add(card);
  return card;
}

export const updateCard = (
  db: MingTabDB,
  id: string,
  changes: Partial<Pick<Card, 'url' | 'title' | 'customTitle' | 'note' | 'collectionId' | 'position'>>,
) => db.cards.update(id, { ...changes, updatedAt: now() });

export const deleteCard = (db: MingTabDB, id: string) => {
  const t = now();
  return db.cards.update(id, { deletedAt: t, updatedAt: t });
};

/** Hard-deletes everything. Used by import-replace and tests. */
export const wipeAll = (db: MingTabDB) =>
  db.transaction('rw', db.spaces, db.collections, db.cards, db.tags, async () => {
    await Promise.all([db.spaces.clear(), db.collections.clear(), db.cards.clear(), db.tags.clear()]);
  });

/** Moves all of `sourceId`'s cards to the end of `targetId`, then deletes the source. */
export async function mergeCollections(db: MingTabDB, sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  await db.transaction('rw', db.collections, db.cards, async () => {
    const [moving, existing] = await Promise.all([listCards(db, sourceId), listCards(db, targetId)]);
    let last = existing.at(-1)?.position ?? null;
    const t = now();
    for (const card of moving) {
      last = positionBetween(last, null);
      await db.cards.update(card.id, { collectionId: targetId, position: last, updatedAt: t });
    }
    await db.collections.update(sourceId, { deletedAt: t, updatedAt: t });
  });
}
