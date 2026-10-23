import { describe, expect, it } from 'vitest';
import type { Card, Collection, Space } from '../db/schema';
import { buildIndex, matchesTab, search } from './search';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const space: Space = { ...base, id: 's1', name: 'Work', position: 'a0' };
const col = (id: string, title: string): Collection => ({
  ...base, id, spaceId: 's1', title, position: 'a0', starred: false, collapsed: false, tagIds: [],
});
const card = (id: string, title: string, url: string, note = '', customTitle = ''): Card => ({
  ...base, id, collectionId: 'c1', title, url, note, customTitle, favIconUrl: '', position: 'a0',
});

const data = {
  spaces: [space],
  collections: [col('c1', 'Lisbon trip'), col('c2', 'Release')],
  cards: [
    card('k1', 'Flights to Portugal', 'https://flights.example/lisbon'),
    card('k2', 'Lisbon - Wikipedia', 'https://en.wikipedia.org/wiki/Lisbon'),
    card('k3', 'Hotel list', 'https://docs.example/sheet', 'near Alfama, book by Friday'),
    card('k4', 'Untitled doc', 'https://docs.example/d/123', '', 'Release plan'),
  ],
};
const index = buildIndex(data);
const ids = (q: string) => search(index, q).cards.map((c) => c.id);

describe('search', () => {
  it('matches title, URL and note, all tokens required', () => {
    expect(ids('alfama')).toEqual(['k3']);
    expect(ids('wikipedia')).toEqual(['k2']);
    expect(ids('lisbon flights')).toEqual(['k1']);
    expect(ids('lisbon nothere')).toEqual([]);
  });
  it('custom titles are searchable and win over the original', () => {
    expect(ids('release plan')).toEqual(['k4']);
  });
  it('title matches rank above URL-only matches', () => {
    // k2 has "lisbon" in its title; k1 only in its URL.
    expect(ids('lisbon')).toEqual(['k2', 'k1']);
  });
  it('finds collections and spaces too', () => {
    expect(search(index, 'lisbon').collections.map((c) => c.id)).toEqual(['c1']);
    expect(search(index, 'work').spaces.map((s) => s.id)).toEqual(['s1']);
  });
  it('blank query returns nothing', () => {
    expect(search(index, '   ').cards).toEqual([]);
  });
  it('open tabs and history use the same rules', () => {
    expect(matchesTab({ title: 'Lisbon - Wikipedia', url: 'https://en.wikipedia.org' }, 'wiki lisbon')).toBe(true);
    expect(matchesTab({ title: 'Other' }, 'lisbon')).toBe(false);
  });
});

describe('search performance', () => {
  it('searches 5,000 cards in under 50 ms', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
    const cards = Array.from({ length: 5000 }, (_, i) =>
      card(`k${i}`, `${words[i % 10]} ${words[(i * 7) % 10]} page ${i}`, `https://site${i % 300}.example/${words[(i * 3) % 10]}/${i}`, i % 5 ? '' : `note ${words[i % 10]}`),
    );
    cards.push(card('needle', 'The one I half remember', 'https://needle.example/x'));
    const idx = buildIndex({ spaces: [space], collections: [col('c1', 'x')], cards });
    const queries = ['half remember', 'needle', 'alpha golf', 'site42', 'note echo', 'page 4999', 'zzz'];
    const t0 = performance.now();
    for (const q of queries) search(idx, q);
    const perQuery = (performance.now() - t0) / queries.length;
    expect(search(idx, 'half remember').cards.map((c) => c.id)).toEqual(['needle']);
    expect(perQuery).toBeLessThan(50);
    console.log(`search: ${perQuery.toFixed(2)} ms/query over ${cards.length} cards`);
  });
});
