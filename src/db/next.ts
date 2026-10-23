import type { MingTabDB } from './db';
import { byPosition, positionAfterLast, reorderPosition } from './position';
import type { NextItem } from './schema';

// The Next queue: pages to get through, in order. Items keep their own copy
// of url/title so they survive the card being edited or deleted.

const live = (n: NextItem) => n.deletedAt === null;

export async function listNext(db: MingTabDB): Promise<{ pending: NextItem[]; done: NextItem[] }> {
  const all = (await db.next.filter(live).toArray()).sort(byPosition);
  return {
    pending: all.filter((n) => n.doneAt === null),
    done: all.filter((n) => n.doneAt !== null).sort((a, b) => b.doneAt! - a.doneAt!),
  };
}

export interface NewNext {
  cardId?: string | null;
  url: string;
  title: string;
  favIconUrl?: string;
}

/** Adds to the end of the queue; a URL already waiting isn't added twice. Returns the item and whether it was new. */
export async function addToNext(db: MingTabDB, input: NewNext): Promise<{ item: NextItem; added: boolean }> {
  return db.transaction('rw', db.next, async () => {
    const { pending } = await listNext(db);
    const existing = pending.find((n) => n.url === input.url);
    if (existing) return { item: existing, added: false };
    const t = Date.now();
    const item: NextItem = {
      id: crypto.randomUUID(),
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      cardId: input.cardId ?? null,
      url: input.url,
      title: input.title,
      favIconUrl: input.favIconUrl ?? '',
      position: positionAfterLast(pending),
      doneAt: null,
    };
    await db.next.add(item);
    return { item, added: true };
  });
}

export const setNextDone = (db: MingTabDB, id: string, done: boolean) => {
  const t = Date.now();
  return db.next.update(id, { doneAt: done ? t : null, updatedAt: t });
};

export const removeNext = (db: MingTabDB, id: string) => {
  const t = Date.now();
  return db.next.update(id, { deletedAt: t, updatedAt: t });
};

export async function clearDoneNext(db: MingTabDB) {
  const { done } = await listNext(db);
  const t = Date.now();
  await db.next.bulkUpdate(done.map((n) => ({ key: n.id, changes: { deletedAt: t, updatedAt: t } })));
  return done.length;
}

export async function moveNext(db: MingTabDB, activeId: string, overId: string) {
  const { pending } = await listNext(db);
  const position = reorderPosition(pending, activeId, overId);
  if (position) await db.next.update(activeId, { position, updatedAt: Date.now() });
}
