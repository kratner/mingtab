import 'fake-indexeddb/auto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MingTabDB } from '../db/db';
import { listCards, listCollections, listSpaces } from '../db/repo';
import {
  FALLBACK_SPACE,
  applyImport,
  fingerprint,
  parseSpaceMap,
  parseTobyExport,
  planTobyImport,
  type TobyExport,
  type TobySpaceMap,
} from './toby';

const sample: TobyExport = {
  version: 3,
  lists: [
    {
      title: 'Work',
      labels: [],
      cards: [
        { title: 'Docs', url: 'https://docs.example', favIconUrl: '', customTitle: 'My docs', customDescription: 'daily' },
        { title: 'New Note', url: '/note.html', favIconUrl: '', customTitle: '', customDescription: '' },
      ],
    },
    { title: 'Empty', labels: [], cards: [] },
    { title: 'Recipes A', labels: [], cards: [{ title: 'Soup', url: 'https://soup.example' }] },
    { title: 'Orphan', labels: [], cards: [{ title: 'Lost', url: 'https://lost.example' }] },
  ],
};

async function sampleMap(): Promise<TobySpaceMap> {
  const fp = (i: number) => fingerprint(sample.lists[i]!.title, sample.lists[i]!.cards.map((c) => c.url));
  return {
    kind: 'toby-space-map',
    version: 1,
    spaces: [
      { id: 'org1-default', name: '', org: 'Org One', type: 'personal' },
      { id: 'org2-default', name: '', org: 'Org Two', type: 'personal' },
      { id: 'org2-recipes', name: 'Recipes', org: 'Org Two', type: 'private' },
    ],
    lists: [
      { fp: await fp(0), spaceId: 'org1-default', position: 1, star: true },
      { fp: await fp(1), spaceId: 'org2-default', position: 2, star: false },
      { fp: await fp(2), spaceId: 'org2-recipes', position: 3, star: false },
      // 'Orphan' deliberately missing from the map
    ],
  };
}

describe('parseTobyExport', () => {
  it('accepts a Toby export', () => {
    expect(parseTobyExport(JSON.parse(JSON.stringify(sample))).lists).toHaveLength(4);
  });
  it('rejects other JSON with a clear message', () => {
    expect(() => parseTobyExport({ foo: 1 })).toThrow(/Not a Toby JSON export/);
    expect(() => parseTobyExport({ lists: [{ title: 'x', cards: [{}] }] })).toThrow(/has no URL/);
  });
  it('rejects a non-map as space map', () => {
    expect(() => parseSpaceMap(sample)).toThrow(/space map/);
  });
});

describe('planTobyImport', () => {
  it('without a space map puts everything in one space', async () => {
    const plan = await planTobyImport(sample, null, { skipEmpty: false });
    expect(plan.spaces.map((s) => s.name)).toEqual([FALLBACK_SPACE]);
    expect(plan.report.toImport).toEqual({ spaces: 1, collections: 4, cards: 4 });
    expect(plan.report.noteCardsWithoutText).toBe(1);
  });

  it('with a space map rebuilds spaces, names unnamed ones, and routes unmatched to the fallback', async () => {
    const plan = await planTobyImport(sample, await sampleMap(), { skipEmpty: false });
    expect(plan.spaces.map((s) => s.name)).toEqual([
      'My Collections',
      'My Collections (Org Two)',
      'Recipes',
      FALLBACK_SPACE,
    ]);
    expect(plan.report.unmatchedCollections).toBe(1);
    expect(plan.spaces[0]!.collections[0]!.starred).toBe(true);
  });

  it('skipEmpty drops empty collections and the spaces they leave empty', async () => {
    const plan = await planTobyImport(sample, await sampleMap(), { skipEmpty: true });
    expect(plan.report.skippedEmptyCollections).toBe(1);
    expect(plan.spaces.map((s) => s.name)).not.toContain('My Collections (Org Two)');
    expect(plan.report.toImport.collections).toBe(3);
  });

  it('maps card fields and blanks note-card URLs', async () => {
    const plan = await planTobyImport(sample, null, { skipEmpty: false });
    const [docs, note] = plan.spaces[0]!.collections[0]!.cards;
    expect(docs).toMatchObject({ url: 'https://docs.example', customTitle: 'My docs', note: 'daily' });
    expect(note).toMatchObject({ url: '', title: 'New Note' });
  });
});

describe('applyImport', () => {
  it('writes the plan in order and can append or replace', async () => {
    const db = new MingTabDB(`test-${crypto.randomUUID()}`);
    const plan = await planTobyImport(sample, await sampleMap(), { skipEmpty: false });
    await applyImport(db, plan, 'add');

    const spaces = await listSpaces(db);
    expect(spaces.map((s) => s.name)).toEqual(plan.spaces.map((s) => s.name));
    const work = (await listCollections(db, spaces[0]!.id))[0]!;
    expect((await listCards(db, work.id)).map((c) => c.title)).toEqual(['Docs', 'New Note']);

    await applyImport(db, plan, 'add');
    expect(await listSpaces(db)).toHaveLength(8);
    await applyImport(db, plan, 'replace');
    expect(await listSpaces(db)).toHaveLength(4);
  });
});

// Runs against Keith's real export when present (imports/ is git-ignored).
const importsDir = path.resolve(import.meta.dirname, '../../imports');
const realExport = existsSync(importsDir)
  ? readdirSync(importsDir).find((f) => /^toby-export.*\.json$/.test(f))
  : undefined;
const realMap = existsSync(path.join(importsDir, 'toby-space-map.json'));

describe.skipIf(!realExport || !realMap)('real Toby export (imports/)', () => {
  const load = (f: string) => JSON.parse(readFileSync(path.join(importsDir, f), 'utf8'));

  it('imports every collection and card, each into its Toby space', async () => {
    const data = parseTobyExport(load(realExport!));
    const map = parseSpaceMap(load('toby-space-map.json'));
    const plan = await planTobyImport(data, map, { skipEmpty: false });

    expect(plan.report.unmatchedCollections).toBe(0);
    expect(plan.report.toImport.collections).toBe(plan.report.inExport.collections);
    expect(plan.report.toImport.cards).toBe(plan.report.inExport.cards);

    const db = new MingTabDB(`test-${crypto.randomUUID()}`);
    await applyImport(db, plan, 'replace');
    expect(await db.collections.count()).toBe(plan.report.inExport.collections);
    expect(await db.cards.count()).toBe(plan.report.inExport.cards);
    console.log('real export:', JSON.stringify(plan.report));
  });
});
