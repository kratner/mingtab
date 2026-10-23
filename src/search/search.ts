import { displayTitle, type Card, type Collection, type Space } from '../db/schema';

// In-memory search over everything saved. The index is built once from the
// live records (lowercased haystacks) and each query is a linear scan, which
// stays well under 50 ms at 5,000 cards (see search.test.ts).

export interface SearchData {
  spaces: Space[];
  collections: Collection[];
  cards: Card[];
}

interface Entry<T> {
  item: T;
  title: string;
  rest: string;
}

export interface SearchIndex {
  spaces: Entry<Space>[];
  collections: Entry<Collection>[];
  cards: Entry<Card>[];
  spaceById: Map<string, Space>;
  collectionById: Map<string, Collection>;
}

export interface SearchResults {
  spaces: Space[];
  collections: Collection[];
  cards: Card[];
}

const lc = (s: string | undefined) => (s ?? '').toLowerCase();

export function buildIndex(data: SearchData): SearchIndex {
  return {
    spaces: data.spaces.map((s) => ({ item: s, title: lc(s.name), rest: '' })),
    collections: data.collections.map((c) => ({ item: c, title: lc(c.title), rest: '' })),
    cards: data.cards.map((c) => ({ item: c, title: lc(displayTitle(c)), rest: `${lc(c.title)} ${lc(c.url)} ${lc(c.note)}` })),
    spaceById: new Map(data.spaces.map((s) => [s.id, s])),
    collectionById: new Map(data.collections.map((c) => [c.id, c])),
  };
}

export const tokenize = (q: string) => lc(q).split(/\s+/).filter(Boolean);

/**
 * Every token must appear somewhere (title, URL or note). Ranking: all tokens
 * in the title beats a partial title match beats URL/note-only; a title that
 * starts with the first token gets a bonus. Ties keep saved order.
 */
function rank<T>(entries: Entry<T>[], tokens: string[], limit: number): T[] {
  const hits: { item: T; score: number; i: number }[] = [];
  entries.forEach((e, i) => {
    let inTitle = 0;
    for (const t of tokens) {
      if (e.title.includes(t)) inTitle++;
      else if (!e.rest.includes(t)) return;
    }
    const score = (inTitle === tokens.length ? 4 : inTitle > 0 ? 2 : 0) + (e.title.startsWith(tokens[0]!) ? 1 : 0);
    hits.push({ item: e.item, score, i });
  });
  return hits
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((h) => h.item);
}

export function search(index: SearchIndex, query: string, limit = 50): SearchResults {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { spaces: [], collections: [], cards: [] };
  return {
    spaces: rank(index.spaces, tokens, 10),
    collections: rank(index.collections, tokens, 20),
    cards: rank(index.cards, tokens, limit),
  };
}

/** Matches for open tabs or history entries (title + URL), same rules. */
export function matchesTab(t: { title?: string; url?: string }, query: string): boolean {
  const hay = `${lc(t.title)} ${lc(t.url)}`;
  return tokenize(query).every((tok) => hay.includes(tok));
}
