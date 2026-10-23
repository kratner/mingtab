import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MingTabDB } from './db';
import {
  addCard,
  createCollection,
  createSpace,
  deleteCard,
  deleteCollection,
  deleteSpace,
  listCards,
  listCollections,
  listSpaces,
  renameSpace,
  updateCard,
} from './repo';

let db: MingTabDB;
beforeEach(() => {
  db = new MingTabDB(`test-${crypto.randomUUID()}`);
});

describe('repo', () => {
  it('keeps spaces, collections and cards in insertion order', async () => {
    const a = await createSpace(db, 'A');
    await createSpace(db, 'B');
    const c1 = await createCollection(db, a.id, 'one');
    await createCollection(db, a.id, 'two');
    await addCard(db, c1.id, { url: 'https://a.example', title: 'A' });
    await addCard(db, c1.id, { url: 'https://b.example', title: 'B' });

    expect((await listSpaces(db)).map((s) => s.name)).toEqual(['A', 'B']);
    expect((await listCollections(db, a.id)).map((c) => c.title)).toEqual(['one', 'two']);
    expect((await listCards(db, c1.id)).map((c) => c.url)).toEqual(['https://a.example', 'https://b.example']);
  });

  it('edits bump updatedAt', async () => {
    const s = await createSpace(db, 'Old');
    await new Promise((r) => setTimeout(r, 2));
    await renameSpace(db, s.id, 'New');
    const after = (await db.spaces.get(s.id))!;
    expect(after.name).toBe('New');
    expect(after.updatedAt).toBeGreaterThan(s.updatedAt);
  });

  it('card custom title and note are stored', async () => {
    const s = await createSpace(db, 'S');
    const c = await createCollection(db, s.id, 'C');
    const card = await addCard(db, c.id, { url: 'https://x.example', title: 'Page' });
    await updateCard(db, card.id, { customTitle: 'Mine', note: 'remember this' });
    const [stored] = await listCards(db, c.id);
    expect(stored).toMatchObject({ customTitle: 'Mine', note: 'remember this' });
  });

  it('deletes are tombstones and cascade', async () => {
    const s = await createSpace(db, 'S');
    const c = await createCollection(db, s.id, 'C');
    const k1 = await addCard(db, c.id, { url: 'https://1.example' });
    await addCard(db, c.id, { url: 'https://2.example' });

    await deleteCard(db, k1.id);
    expect(await listCards(db, c.id)).toHaveLength(1);
    expect((await db.cards.get(k1.id))!.deletedAt).not.toBeNull();

    await deleteCollection(db, c.id);
    expect(await listCollections(db, s.id)).toHaveLength(0);
    expect(await db.cards.where('collectionId').equals(c.id).filter((x) => x.deletedAt === null).count()).toBe(0);

    const c2 = await createCollection(db, s.id, 'C2');
    await addCard(db, c2.id, { url: 'https://3.example' });
    await deleteSpace(db, s.id);
    expect(await listSpaces(db)).toHaveLength(0);
    expect(await db.cards.filter((x) => x.deletedAt === null).count()).toBe(0);
    expect(await db.cards.count()).toBe(3); // still there as tombstones
  });
});

describe('tags', () => {
  it('reuses tags by name (case-insensitive) and removes them from a collection', async () => {
    const { addTagToCollection, listTags, removeTagFromCollection } = await import('./repo');
    const s = await createSpace(db, 'S');
    const a = await createCollection(db, s.id, 'A');
    const b = await createCollection(db, s.id, 'B');
    const t1 = await addTagToCollection(db, a.id, 'Clients');
    const t2 = await addTagToCollection(db, b.id, ' clients ');
    expect(t2.id).toBe(t1.id);
    expect(await listTags(db)).toHaveLength(1);
    await addTagToCollection(db, a.id, 'Clients'); // no duplicate tagIds
    expect((await db.collections.get(a.id))!.tagIds).toEqual([t1.id]);
    await removeTagFromCollection(db, a.id, t1.id);
    expect((await db.collections.get(a.id))!.tagIds).toEqual([]);
  });
});

describe('board order helpers + bulk delete', () => {
  it('lists cards space → collection → card, and deleteCards tombstones them', async () => {
    const { listAllCardsInOrder, deleteCards } = await import('./repo');
    const s2 = await createSpace(db, 'Second');
    const s1 = await createSpace(db, 'First');
    const c2 = await createCollection(db, s2.id, 'C2');
    const c1 = await createCollection(db, s1.id, 'C1');
    await addCard(db, c1.id, { url: 'https://1.example' });
    await addCard(db, c2.id, { url: 'https://2.example' });
    const all = await listAllCardsInOrder(db);
    expect(all.map((c) => c.url)).toEqual(['https://2.example', 'https://1.example']); // Second was created first
    await deleteCards(db, [all[0]!.id]);
    expect((await listAllCardsInOrder(db)).map((c) => c.url)).toEqual(['https://1.example']);
  });
});
