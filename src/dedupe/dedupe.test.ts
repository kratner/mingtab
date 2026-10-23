import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Card } from '../db/schema';
import { extraCopies, findDuplicates, normalizeUrl } from './dedupe';

const card = (id: string, url: string): Card => ({
  id, url, collectionId: 'c', title: id, customTitle: '', note: '', favIconUrl: '', position: 'a0',
  createdAt: 0, updatedAt: 0, deletedAt: null,
});

describe('normalizeUrl', () => {
  it('ignores case of host, www, fragments, trailing slashes and tracking params', () => {
    const same = [
      'https://Example.com/docs/',
      'https://www.example.com/docs',
      'https://example.com/docs#section-2',
      'https://example.com/docs?utm_source=x&utm_medium=y',
      'https://example.com/docs/?fbclid=abc',
    ];
    expect(new Set(same.map(normalizeUrl)).size).toBe(1);
  });
  it('keeps meaningful differences', () => {
    expect(normalizeUrl('https://example.com/docs?id=1')).not.toBe(normalizeUrl('https://example.com/docs?id=2'));
    expect(normalizeUrl('http://example.com/a')).not.toBe(normalizeUrl('https://example.com/a'));
    expect(normalizeUrl('https://example.com/Docs')).not.toBe(normalizeUrl('https://example.com/docs'));
  });
  it('sorts remaining params', () => {
    expect(normalizeUrl('https://x.example/?b=2&a=1')).toBe(normalizeUrl('https://x.example/?a=1&b=2'));
  });
});

describe('findDuplicates', () => {
  it('groups copies, keeps board order, ignores note cards', () => {
    const cards = [
      card('k1', 'https://a.example/'),
      card('k2', 'https://b.example/'),
      card('k3', 'https://www.a.example'),
      card('n1', ''),
      card('n2', ''),
      card('k4', 'https://a.example/#x'),
    ];
    const groups = findDuplicates(cards);
    expect(groups.map((g) => g.cards.map((c) => c.id))).toEqual([['k1', 'k3', 'k4']]);
    expect(extraCopies(groups)).toBe(2);
    expect(extraCopies(findDuplicates(cards, false))).toBe(0);
  });
});

// Keith's real export (git-ignored). The plan's "83 duplicates" was cards minus unique URLs,
// which counted the 4 note cards (all "/note.html") as 3 duplicates. Excluding them: 80.
const importsDir = path.resolve(import.meta.dirname, '../../imports');
const realExport = existsSync(importsDir) ? readdirSync(importsDir).find((f) => /^toby-export.*\.json$/.test(f)) : undefined;

describe.skipIf(!realExport)('real Toby export', () => {
  it('finds the 83 exact duplicates, and at least as many after normalizing', () => {
    const data = JSON.parse(readFileSync(path.join(importsDir, realExport!), 'utf8')) as {
      lists: { cards: { url: string }[] }[];
    };
    const cards = data.lists.flatMap((l, i) => l.cards.map((c, j) => card(`${i}-${j}`, c.url.startsWith('/note.html') ? '' : c.url)));
    const exact = extraCopies(findDuplicates(cards, false));
    const normalized = extraCopies(findDuplicates(cards));
    console.log(`real export duplicates: exact ${exact}, normalized ${normalized}`);
    expect(exact).toBe(80);
    expect(normalized).toBeGreaterThanOrEqual(exact);
  });
});
