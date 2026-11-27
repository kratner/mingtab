import { describe, expect, it } from 'vitest';
import type { Card, Collection } from '../db/schema';
import { ago, asGroup, asSort, groupBySite, groupByYear, isStale, sortCollections } from './organise';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 27);
let n = 0;
const col = (title: string, over: Partial<Collection> = {}): Collection => ({
  id: `c${++n}`,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  spaceId: 's',
  title,
  position: String(n),
  starred: false,
  collapsed: false,
  tagIds: [],
  ...over,
});
const card = (collectionId: string, url: string): Card => ({
  id: `k${++n}`,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  collectionId,
  url,
  title: url,
  customTitle: '',
  note: '',
  favIconUrl: '',
  position: String(n),
});
const titles = (cs: Collection[]) => cs.map((c) => c.title);

describe('sortCollections', () => {
  const a = col('A', { createdAt: NOW - 300 * DAY, lastOpenedAt: NOW - 2 * DAY });
  const b = col('B', { createdAt: NOW - 100 * DAY });
  const c = col('C', { createdAt: NOW - 500 * DAY, lastOpenedAt: NOW - 1 * DAY });
  const d = col('D', { createdAt: NOW - 50 * DAY });
  const tabs = new Map([
    [a.id, 3],
    [b.id, 10],
    [c.id, 1],
  ]);

  it('custom keeps position order; tab counts sort both ways (missing = 0, ties stay in order)', () => {
    expect(titles(sortCollections([a, b, c, d], 'custom', tabs))).toEqual(['A', 'B', 'C', 'D']);
    expect(titles(sortCollections([a, b, c, d], 'most', tabs))).toEqual(['B', 'A', 'C', 'D']);
    expect(titles(sortCollections([a, b, c, d], 'fewest', tabs))).toEqual(['D', 'C', 'A', 'B']);
  });

  it('recently opened puts never-opened last (newest saved first); not opened lately is the reverse', () => {
    expect(titles(sortCollections([a, b, c, d], 'recent'))).toEqual(['C', 'A', 'D', 'B']);
    expect(titles(sortCollections([a, b, c, d], 'stale'))).toEqual(['B', 'D', 'A', 'C']);
  });

  it('falls back to defaults for preferences it does not know', () => {
    expect(asSort('most')).toBe('most');
    expect(asSort('bogus')).toBe('custom');
    expect(asGroup('site')).toBe('site');
    expect(asGroup('')).toBe('none');
  });
});

describe('groupByYear', () => {
  it('puts the newest year first and keeps the sort inside each year', () => {
    const y = (yr: number, t: string) => col(t, { createdAt: Date.UTC(yr, 5, 1) });
    const groups = groupByYear([y(2021, 'x'), y(2024, 'y'), y(2021, 'z')]);
    expect(groups.map((g) => [g.year, titles(g.collections)])).toEqual([
      [2024, ['y']],
      [2021, ['x', 'z']],
    ]);
  });
});

describe('groupBySite', () => {
  it('gathers saved pages by host (www. dropped), most first then A–Z, skipping notes', () => {
    const sites = groupBySite([
      card('c', 'https://b.com/1'),
      card('c', 'https://www.youtube.com/a'),
      card('d', ''),
      card('d', 'https://youtube.com/b'),
      card('d', 'https://a.com/1'),
    ]);
    expect(sites.map((s) => [s.host, s.cards.map((c) => c.url)])).toEqual([
      ['youtube.com', ['https://www.youtube.com/a', 'https://youtube.com/b']],
      ['a.com', ['https://a.com/1']],
      ['b.com', ['https://b.com/1']],
    ]);
  });
});

describe('staleness and labels', () => {
  it('is stale only when saved over a year ago and not opened in the past year', () => {
    expect(isStale(col('new'), NOW)).toBe(false);
    expect(isStale(col('old', { createdAt: NOW - 400 * DAY }), NOW)).toBe(true);
    expect(isStale(col('old, opened', { createdAt: NOW - 400 * DAY, lastOpenedAt: NOW - 10 * DAY }), NOW)).toBe(false);
  });

  it('says when it was opened', () => {
    expect(ago(undefined, NOW)).toBe('never opened');
    expect(ago(NOW - 1000, NOW)).toBe('opened today');
    expect(ago(NOW - DAY, NOW)).toBe('opened yesterday');
    expect(ago(NOW - 5 * DAY, NOW)).toBe('opened 5 days ago');
    expect(ago(NOW - 70 * DAY, NOW)).toBe('opened 2 months ago');
    expect(ago(NOW - 800 * DAY, NOW)).toBe('opened 2 years ago');
  });
});
