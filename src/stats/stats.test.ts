import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MingTabDB } from '../db/db';
import { addCard, createCollection, createSpace, deleteCard } from '../db/repo';
import type { Card, Collection, Space } from '../db/schema';
import { computeStats, countTabs, loadStats, loadTotals } from './stats';

const meta = (id: string) => ({ id, createdAt: 0, updatedAt: 0, deletedAt: null as number | null });
const space = (id: string, name = id): Space => ({ ...meta(id), name, position: id });
const col = (id: string, spaceId: string, position = id): Collection => ({
  ...meta(id), spaceId, title: id.toUpperCase(), position, starred: false, collapsed: false, tagIds: [],
});
const card = (id: string, collectionId: string, url: string, note = ''): Card => ({
  ...meta(id), collectionId, url, title: id, customTitle: '', note, favIconUrl: '', position: id,
});

describe('computeStats', () => {
  const spaces = [space('w', 'Work'), space('p', 'Personal')];
  const cols = [col('a', 'w'), col('b', 'w'), col('c', 'p'), col('empty', 'p'), col('hidden', 'gone')];
  const cards = [
    card('1', 'a', 'https://www.github.com/x'),
    card('2', 'a', 'https://github.com/y', 'read later'),
    card('3', 'a', ''), // a note card
    card('4', 'b', 'https://github.com/x#top'), // duplicate of 1
    card('5', 'c', 'https://docs.google.com/d'),
    card('6', 'hidden', 'https://elsewhere.example/'), // in a space that isn't shown
    { ...card('7', 'c', 'https://deleted.example/'), deletedAt: 5 },
  ];

  it('counts tabs, notes, duplicates and empty collections in the shown spaces only', () => {
    const s = computeStats(spaces, cols, cards);
    expect(s).toMatchObject({ spaces: 2, collections: 4, tabs: 4, notes: 1, tabsWithNotes: 1, duplicates: 1, emptyCollections: 1 });
  });

  it('ranks the biggest collections and most-saved sites', () => {
    const s = computeStats(spaces, cols, cards, 2);
    expect(s.biggest).toEqual([
      { id: 'a', spaceId: 'w', spaceName: 'Work', title: 'A', tabs: 2 },
      { id: 'b', spaceId: 'w', spaceName: 'Work', title: 'B', tabs: 1 },
    ]);
    expect(s.topSites).toEqual([{ host: 'github.com', tabs: 3 }, { host: 'docs.google.com', tabs: 1 }]);
  });

  it('handles an empty board', () => {
    expect(computeStats([], [], [])).toMatchObject({ spaces: 0, collections: 0, tabs: 0, duplicates: 0, biggest: [], topSites: [] });
  });
});

describe('loadStats and countTabs', () => {
  it('read live records from IndexedDB', async () => {
    const db = new MingTabDB(`stats-${crypto.randomUUID()}`);
    const work = await createSpace(db, 'Work');
    const a = await createCollection(db, work.id, 'A');
    const b = await createCollection(db, work.id, 'B');
    await addCard(db, a.id, { url: 'https://a.example/1', title: '1' });
    const gone = await addCard(db, a.id, { url: 'https://a.example/2', title: '2' });
    await addCard(db, b.id, { url: '', title: 'note', note: 'just text' });
    await addCard(db, b.id, { url: 'https://a.example/1', title: '1 again' });
    await deleteCard(db, gone.id);

    expect(await countTabs(db, [a.id, b.id])).toBe(2);
    expect(await countTabs(db, [b.id])).toBe(1);
    const s = await loadStats(db, [work]);
    expect(s).toMatchObject({ collections: 2, tabs: 2, notes: 1, duplicates: 1 });
    expect(await loadTotals(db, [work.id])).toEqual({ collections: 2, tabs: 2 });
    expect(await loadTotals(db, [])).toEqual({ collections: 0, tabs: 0 });
  });
});
