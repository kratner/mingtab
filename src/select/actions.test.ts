import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MingTabDB } from '../db/db';
import { addCard, createCollection, createSpace, listCards, listCollections } from '../db/repo';
import { setCardShortcut } from '../db/shortcuts';
import { collectionFromCards, deleteSelected, placeCards, selectedInOrder } from './actions';

let db: MingTabDB;
let ids: Record<string, string>;
let cols: Record<string, string>;
let spaceId: string;
const urls = async (colId: string) => (await listCards(db, colId)).map((c) => c.title);

beforeEach(async () => {
  db = new MingTabDB(`select-${crypto.randomUUID()}`);
  spaceId = (await createSpace(db, 'Work')).id;
  cols = {};
  ids = {};
  for (const [name, cards] of [['A', ['a1', 'a2', 'a3']], ['B', ['b1', 'b2']]] as const) {
    cols[name] = (await createCollection(db, spaceId, name)).id;
    for (const t of cards) ids[t] = (await addCard(db, cols[name]!, { url: `https://${t}.example/`, title: t })).id;
  }
});

describe('select actions', () => {
  it('returns the chosen cards in board order, whatever order they were picked in', async () => {
    const cards = await selectedInOrder(db, [ids.b1!, ids.a3!, ids.a1!]);
    expect(cards.map((c) => c.title)).toEqual(['a1', 'a3', 'b1']);
  });

  it('moves cards to the end of another collection, and undoes the move', async () => {
    const undo = await placeCards(db, await selectedInOrder(db, [ids.a1!, ids.a3!]), cols.B!, 'move');
    expect(await urls(cols.A!)).toEqual(['a2']);
    expect(await urls(cols.B!)).toEqual(['b1', 'b2', 'a1', 'a3']);
    await undo();
    expect(await urls(cols.A!)).toEqual(['a1', 'a2', 'a3']);
    expect(await urls(cols.B!)).toEqual(['b1', 'b2']);
  });

  it('copies cards without their shortcut, and undoes the copy', async () => {
    await setCardShortcut(db, ids.a1!, 'docs');
    const undo = await placeCards(db, await selectedInOrder(db, [ids.a1!]), cols.B!, 'copy');
    const b = await listCards(db, cols.B!);
    expect(b.map((c) => c.title)).toEqual(['b1', 'b2', 'a1']);
    expect(b[2]!.id).not.toBe(ids.a1);
    expect(b[2]!.shortcut).toBeUndefined();
    expect(await urls(cols.A!)).toEqual(['a1', 'a2', 'a3']);
    await undo();
    expect(await urls(cols.B!)).toEqual(['b1', 'b2']);
  });

  it('makes a new collection first in the space from cards in several collections', async () => {
    const { id, undo } = await collectionFromCards(db, spaceId, 'Picked', await selectedInOrder(db, [ids.b2!, ids.a2!]), 'move');
    expect((await listCollections(db, spaceId)).map((c) => c.title)).toEqual(['Picked', 'A', 'B']);
    expect(await urls(id)).toEqual(['a2', 'b2']);
    expect(await urls(cols.A!)).toEqual(['a1', 'a3']);
    await undo();
    expect((await listCollections(db, spaceId)).map((c) => c.title)).toEqual(['A', 'B']);
    expect(await urls(cols.A!)).toEqual(['a1', 'a2', 'a3']);
    expect(await urls(cols.B!)).toEqual(['b1', 'b2']);
  });

  it('deletes cards and brings them back', async () => {
    const undo = await deleteSelected(db, await selectedInOrder(db, [ids.a2!, ids.b1!]));
    expect(await urls(cols.A!)).toEqual(['a1', 'a3']);
    expect(await urls(cols.B!)).toEqual(['b2']);
    await undo();
    expect(await urls(cols.A!)).toEqual(['a1', 'a2', 'a3']);
    expect(await urls(cols.B!)).toEqual(['b1', 'b2']);
  });

  it('moving a card into its own collection leaves it alone', async () => {
    await placeCards(db, await selectedInOrder(db, [ids.a1!]), cols.A!, 'move');
    expect(await urls(cols.A!)).toEqual(['a1', 'a2', 'a3']);
  });
});
