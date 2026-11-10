import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MingTabDB } from '../db/db';
import {
  addCard,
  createCollection,
  createSpace,
  listCards,
  listCollections,
  mergeCollections,
} from '../db/repo';
import type { Collection, Space } from '../db/schema';
import { edgeFor, handleDrop } from './drop';

let db: MingTabDB;
let s1: Space, s2: Space;
let a: Collection, b: Collection, c: Collection;

const titles = async (colId: string) => (await listCards(db, colId)).map((x) => x.title);
const colTitles = async (spaceId: string) => (await listCollections(db, spaceId)).map((x) => x.title);
const card = async (colId: string, title: string) => (await listCards(db, colId)).find((x) => x.title === title)!;
const col = async (id: string) => (await db.collections.get(id))!;

beforeEach(async () => {
  db = new MingTabDB(`test-${crypto.randomUUID()}`);
  s1 = await createSpace(db, 'One');
  s2 = await createSpace(db, 'Two');
  a = await createCollection(db, s1.id, 'A');
  b = await createCollection(db, s1.id, 'B');
  c = await createCollection(db, s1.id, 'C');
  for (const t of ['a1', 'a2', 'a3']) await addCard(db, a.id, { url: `https://${t}.example`, title: t });
  for (const t of ['b1', 'b2']) await addCard(db, b.id, { url: `https://${t}.example`, title: t });
});

describe('collections', () => {
  it('reorder within a space', async () => {
    expect(await handleDrop(db, { type: 'collection', collection: a }, { type: 'collection', collection: c })).toBeTruthy();
    expect(await colTitles(s1.id)).toEqual(['B', 'C', 'A']);
    await handleDrop(db, { type: 'collection', collection: await col(a.id) }, { type: 'collection', collection: b });
    expect(await colTitles(s1.id)).toEqual(['A', 'B', 'C']);
  });

  it('move to another space (appended)', async () => {
    await createCollection(db, s2.id, 'Z');
    await handleDrop(db, { type: 'collection', collection: b }, { type: 'space', space: s2 });
    expect(await colTitles(s1.id)).toEqual(['A', 'C']);
    expect(await colTitles(s2.id)).toEqual(['Z', 'B']);
    expect(await titles(b.id)).toEqual(['b1', 'b2']); // cards travel with it
  });

  it('dropping on itself or its own space does nothing', async () => {
    expect(await handleDrop(db, { type: 'collection', collection: a }, { type: 'collection', collection: a })).toBeNull();
    expect(await handleDrop(db, { type: 'collection', collection: a }, { type: 'space', space: s1 })).toBeNull();
  });
});

describe('cards', () => {
  it('reorder within a collection', async () => {
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, { type: 'card', card: await card(a.id, 'a3') });
    expect(await titles(a.id)).toEqual(['a2', 'a3', 'a1']);
  });

  it('move onto a card in another collection lands before it', async () => {
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a2') }, { type: 'card', card: await card(b.id, 'b2') });
    expect(await titles(a.id)).toEqual(['a1', 'a3']);
    expect(await titles(b.id)).toEqual(['b1', 'a2', 'b2']);
  });

  it('move onto a collection appends', async () => {
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, { type: 'collection', collection: c });
    expect(await titles(c.id)).toEqual(['a1']);
  });

  it('move onto a space goes to its first collection; empty space does nothing', async () => {
    expect(await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, { type: 'space', space: s2 })).toBeNull();
    const z = await createCollection(db, s2.id, 'Z');
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, { type: 'space', space: s2 });
    expect(await titles(z.id)).toEqual(['a1']);
  });
});

describe('drop line (edge)', () => {
  it('lands on the side the line showed, within a collection', async () => {
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a3') }, { type: 'card', card: await card(a.id, 'a1') }, 'after');
    expect(await titles(a.id)).toEqual(['a1', 'a3', 'a2']);
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, { type: 'card', card: await card(a.id, 'a2') }, 'before');
    expect(await titles(a.id)).toEqual(['a3', 'a1', 'a2']);
  });

  it('lands after a card in another collection, including after the last one', async () => {
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, { type: 'card', card: await card(b.id, 'b1') }, 'after');
    expect(await titles(b.id)).toEqual(['b1', 'a1', 'b2']);
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a2') }, { type: 'card', card: await card(b.id, 'b2') }, 'after');
    expect(await titles(b.id)).toEqual(['b1', 'a1', 'b2', 'a2']);
  });

  it('dropping next to itself changes nothing', async () => {
    const a2 = await card(a.id, 'a2');
    expect(await handleDrop(db, { type: 'card', card: a2 }, { type: 'card', card: await card(a.id, 'a1') }, 'after')).toBeNull();
    expect(await handleDrop(db, { type: 'card', card: a2 }, { type: 'card', card: await card(a.id, 'a3') }, 'before')).toBeNull();
    expect(await titles(a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it("on its own collection's header a card moves to the end, unless it's already last", async () => {
    const col = { type: 'collection' as const, collection: a };
    await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, col);
    expect(await titles(a.id)).toEqual(['a2', 'a3', 'a1']);
    expect(await handleDrop(db, { type: 'card', card: await card(a.id, 'a1') }, col)).toBeNull();
  });

  it('an open tab lands before or after a card', async () => {
    const tab = { url: 'https://tab.example/', title: 'Tab', favIconUrl: '' };
    await handleDrop(db, { type: 'tab', tab }, { type: 'card', card: await card(a.id, 'a3') }, 'after');
    expect(await titles(a.id)).toEqual(['a1', 'a2', 'a3', 'Tab']);
    await handleDrop(db, { type: 'tab', tab: { ...tab, title: 'Tab2' } }, { type: 'card', card: await card(a.id, 'a1') }, 'before');
    expect(await titles(a.id)).toEqual(['Tab2', 'a1', 'a2', 'a3', 'Tab']);
  });

  it('edgeFor: top half before, bottom half after, the middle goes to the tie', () => {
    const r = { top: 100, height: 40 }; // middle at 120
    expect(edgeFor(105, r, 'after')).toBe('before');
    expect(edgeFor(135, r, 'before')).toBe('after');
    expect(edgeFor(121, r, 'after')).toBe('after');
    expect(edgeFor(119, r, 'before')).toBe('before');
  });
});

describe('open tabs', () => {
  const tab = { url: 'https://tab.example/', title: 'Tab', favIconUrl: '' };

  it('drop on a collection appends a card', async () => {
    await handleDrop(db, { type: 'tab', tab }, { type: 'collection', collection: b });
    expect(await titles(b.id)).toEqual(['b1', 'b2', 'Tab']);
  });

  it('drop on a card inserts before it', async () => {
    await handleDrop(db, { type: 'tab', tab }, { type: 'card', card: await card(a.id, 'a2') });
    expect(await titles(a.id)).toEqual(['a1', 'Tab', 'a2', 'a3']);
  });

  it('cannot be dropped on a space', async () => {
    expect(await handleDrop(db, { type: 'tab', tab }, { type: 'space', space: s2 })).toBeNull();
  });
});

describe('mergeCollections', () => {
  it('appends source cards to target and deletes the source', async () => {
    await mergeCollections(db, a.id, b.id);
    expect(await titles(b.id)).toEqual(['b1', 'b2', 'a1', 'a2', 'a3']);
    expect(await colTitles(s1.id)).toEqual(['B', 'C']);
  });
});
