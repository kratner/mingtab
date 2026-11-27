import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MingTabDB } from '../db/db';
import { addCard, createCollection, createSpace, deleteCard, listCollections, markOpened } from '../db/repo';
import { applyImport, fingerprint, planTobyImport, type TobyExport, type TobySpaceMap } from './toby';
import { applyDateRestore, planDateRestore } from './tobyDates';

const T2019 = '2019-03-04T10:00:00.000Z';
const T2024 = '2024-08-01T10:00:00.000Z';

const toby: TobyExport = {
  version: 3,
  lists: [
    { title: 'Recipes', cards: [{ title: 'a', url: 'https://a.example/' }, { title: 'b', url: 'https://b.example/' }] },
    { title: 'Work', cards: [1, 2, 3, 4, 5].map((i) => ({ title: `w${i}`, url: `https://w.example/${i}` })) },
    { title: 'Gone', cards: [{ title: 'g', url: 'https://g.example/' }] },
    { title: 'Undated', cards: [{ title: 'u', url: 'https://u.example/' }] },
  ],
};

async function spaceMap(): Promise<TobySpaceMap> {
  const fp = (i: number) => fingerprint(toby.lists[i]!.title, toby.lists[i]!.cards.map((c) => c.url));
  return {
    kind: 'toby-space-map',
    version: 1,
    spaces: [],
    lists: [
      { fp: await fp(0), spaceId: 'x', position: 0, star: false, createdAt: T2019 },
      { fp: await fp(1), spaceId: 'x', position: 1, star: false, createdAt: T2024 },
      { fp: await fp(2), spaceId: 'x', position: 2, star: false, createdAt: T2024 },
      { fp: await fp(3), spaceId: 'x', position: 3, star: false },
    ],
  };
}

async function board() {
  const db = new MingTabDB(`dates-${crypto.randomUUID()}`);
  const s = await createSpace(db, 'S');
  const recipes = await createCollection(db, s.id, 'recipes '); // same title, other case and spacing
  await addCard(db, recipes.id, { url: 'https://a.example/', title: 'a' });
  // "Work" renamed, one link de-duplicated away, one added: still 4 of 5 links shared.
  const work = await createCollection(db, s.id, 'Job');
  for (const i of [1, 2, 3, 4]) await addCard(db, work.id, { url: `https://w.example/${i}`, title: '' });
  const dup = await addCard(db, work.id, { url: 'https://w.example/5', title: '' });
  await deleteCard(db, dup.id);
  await addCard(db, work.id, { url: 'https://new.example/', title: '' });
  const mine = await createCollection(db, s.id, 'Made in MingTab');
  await addCard(db, mine.id, { url: 'https://g2.example/', title: '' });
  return { db, s, recipes, work, mine };
}

const all = async (db: MingTabDB) => ({
  cols: await db.collections.toArray(),
  cards: await db.cards.toArray(),
});

describe('restore dates from Toby', () => {
  it('matches by title or shared links, one to one, and only moves dates earlier', async () => {
    const { db, recipes, work, mine } = await board();
    const { cols, cards } = await all(db);
    const plan = await planDateRestore(toby, await spaceMap(), cols, cards);
    expect(plan.dated).toBe(3);
    expect(plan.changes.map((c) => [c.id, new Date(c.to).toISOString()])).toEqual([
      [recipes.id, T2019],
      [work.id, T2024],
    ]);
    expect(plan.unmatched).toBe(1); // "Gone"

    const before = (await db.collections.get(mine.id))!;
    await applyDateRestore(db, plan);
    const after = await listCollections(db, recipes.spaceId);
    expect(after.find((c) => c.id === recipes.id)!.createdAt).toBe(Date.parse(T2019));
    expect(after.find((c) => c.id === recipes.id)!.updatedAt).toBeGreaterThan(Date.parse(T2024)); // so it syncs
    expect(after.find((c) => c.id === mine.id)).toEqual(before);

    // Running it again changes nothing.
    const now = await all(db);
    const again = await planDateRestore(toby, await spaceMap(), now.cols, now.cards);
    expect(again.changes).toEqual([]);
    expect(again.alreadyEarlier).toBe(2);
  });

  it("doesn't pair a renamed collection that shares too few links", async () => {
    const db = new MingTabDB(`dates-${crypto.randomUUID()}`);
    const s = await createSpace(db, 'S');
    const job = await createCollection(db, s.id, 'Job'); // 2 of Work's 5 links, plus 3 others
    for (const u of ['https://w.example/1', 'https://w.example/2', 'https://x.example/1', 'https://x.example/2', 'https://x.example/3'])
      await addCard(db, job.id, { url: u, title: '' });
    const { cols, cards } = await all(db);
    const plan = await planDateRestore(toby, await spaceMap(), cols, cards);
    expect(plan.changes).toEqual([]);
    expect(plan.unmatched).toBe(3);
  });
});

describe('import keeps Toby dates', () => {
  it('dates new collections from the space map', async () => {
    const db = new MingTabDB(`dates-${crypto.randomUUID()}`);
    await applyImport(db, await planTobyImport(toby, await spaceMap(), { skipEmpty: true }), 'add');
    const cols = await db.collections.toArray();
    const byTitle = new Map(cols.map((c) => [c.title, c.createdAt]));
    expect(byTitle.get('Recipes')).toBe(Date.parse(T2019));
    expect(byTitle.get('Work')).toBe(Date.parse(T2024));
    expect(byTitle.get('Undated')).toBeGreaterThan(Date.parse(T2024)); // import time
  });
});

describe('markOpened', () => {
  it('stamps each collection once and bumps updatedAt', async () => {
    const { db, recipes, work, mine } = await board();
    await markOpened(db, [recipes.id, recipes.id, work.id, '']);
    const got = await db.collections.bulkGet([recipes.id, work.id, mine.id]);
    expect(got[0]!.lastOpenedAt).toBeGreaterThan(0);
    expect(got[0]!.updatedAt).toBe(got[0]!.lastOpenedAt);
    expect(got[1]!.lastOpenedAt).toBe(got[0]!.lastOpenedAt);
    expect(got[2]!.lastOpenedAt).toBeUndefined();
  });
});
