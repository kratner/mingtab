import type { MingTabDB } from '../db/db';
import { initialPositions, positionAfterLast } from '../db/position';
import { listSpaces, wipeAll } from '../db/repo';
import type { Card, Collection, Space } from '../db/schema';

// ---- Toby's export format (Settings → Export → .JSON, version 3) ----------
// A flat list of collections. It carries no spaces/organizations; those come
// from the optional space map (see scripts/toby-space-map.js).

export interface TobyCard {
  title: string;
  url: string;
  favIconUrl?: string;
  customTitle?: string;
  customDescription?: string;
}

export interface TobyExport {
  version: number;
  lists: { title: string; cards: TobyCard[]; labels?: unknown[] }[];
}

export interface TobySpaceMap {
  kind: 'toby-space-map';
  version: 1;
  spaces: { id: string; name: string; org: string; type: string }[];
  lists: { fp: string; spaceId: string; position: number; star: boolean }[];
}

export class ImportError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseTobyExport(raw: unknown): TobyExport {
  if (!isObj(raw) || !Array.isArray(raw.lists)) {
    throw new ImportError('Not a Toby JSON export: expected an object with a "lists" array.');
  }
  raw.lists.forEach((l, i) => {
    if (!isObj(l) || typeof l.title !== 'string' || !Array.isArray(l.cards)) {
      throw new ImportError(`Toby export: collection #${i + 1} is missing a title or cards.`);
    }
    l.cards.forEach((c, j) => {
      if (!isObj(c) || typeof c.url !== 'string') {
        throw new ImportError(`Toby export: card #${j + 1} in "${l.title}" has no URL.`);
      }
    });
  });
  return raw as unknown as TobyExport;
}

export function parseSpaceMap(raw: unknown): TobySpaceMap {
  if (!isObj(raw) || raw.kind !== 'toby-space-map' || !Array.isArray(raw.spaces) || !Array.isArray(raw.lists)) {
    throw new ImportError('Not a Toby space map (expected kind "toby-space-map").');
  }
  return raw as unknown as TobySpaceMap;
}

/** Must match the fingerprint computed on web.gettoby.com by the space-map script. */
export async function fingerprint(title: string, urls: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(title + '\n' + urls.join('\n'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- Plan ------------------------------------------------------------------

/** Toby's "note" cards point at its own note page; their text isn't exported. */
export const isTobyNoteCard = (c: TobyCard) => c.url.startsWith('/note.html');

export interface PlannedCard {
  url: string;
  title: string;
  customTitle: string;
  note: string;
  favIconUrl: string;
}

export interface PlannedCollection {
  title: string;
  starred: boolean;
  cards: PlannedCard[];
}

export interface PlannedSpace {
  name: string;
  collections: PlannedCollection[];
}

export interface ImportReport {
  inExport: { collections: number; cards: number };
  toImport: { spaces: number; collections: number; cards: number };
  skippedEmptyCollections: number;
  noteCardsWithoutText: number;
  unmatchedCollections: number;
  bySpace: { name: string; collections: number; cards: number }[];
}

export interface ImportPlan {
  spaces: PlannedSpace[];
  report: ImportReport;
}

export const FALLBACK_SPACE = 'Imported from Toby';
const UNNAMED_SPACE = 'My Collections';

export async function planTobyImport(
  data: TobyExport,
  spaceMap: TobySpaceMap | null,
  opts: { skipEmpty: boolean },
): Promise<ImportPlan> {
  const byFp = new Map(spaceMap?.lists.map((l) => [l.fp, l]) ?? []);
  const spaceNames = spaceMap ? resolveSpaceNames(spaceMap) : new Map<string, string>();

  // Ordered buckets: map spaces first in their Toby order, fallback last.
  const buckets = new Map<string, { name: string; items: { pos: number; col: PlannedCollection }[] }>();
  for (const s of spaceMap?.spaces ?? []) buckets.set(s.id, { name: spaceNames.get(s.id)!, items: [] });
  buckets.set('', { name: FALLBACK_SPACE, items: [] });

  let skipped = 0;
  let notes = 0;
  let unmatched = 0;

  for (const [i, list] of data.lists.entries()) {
    if (opts.skipEmpty && list.cards.length === 0) {
      skipped++;
      continue;
    }
    const hit = spaceMap ? byFp.get(await fingerprint(list.title, list.cards.map((c) => c.url))) : undefined;
    if (spaceMap && !hit) unmatched++;
    const cards = list.cards.map((c): PlannedCard => {
      if (isTobyNoteCard(c)) notes++;
      return {
        url: isTobyNoteCard(c) ? '' : c.url,
        title: c.title ?? '',
        customTitle: c.customTitle ?? '',
        note: c.customDescription ?? '',
        favIconUrl: c.favIconUrl ?? '',
      };
    });
    const bucket = buckets.get(hit?.spaceId ?? '') ?? buckets.get('')!;
    bucket.items.push({ pos: hit?.position ?? i, col: { title: list.title, starred: hit?.star ?? false, cards } });
  }

  const spaces: PlannedSpace[] = [...buckets.values()]
    .filter((b) => b.items.length > 0)
    .map((b) => ({ name: b.name, collections: b.items.sort((x, y) => x.pos - y.pos).map((x) => x.col) }));

  const count = (ss: PlannedSpace[]) => ss.reduce((n, s) => n + s.collections.reduce((m, c) => m + c.cards.length, 0), 0);
  return {
    spaces,
    report: {
      inExport: { collections: data.lists.length, cards: data.lists.reduce((n, l) => n + l.cards.length, 0) },
      toImport: {
        spaces: spaces.length,
        collections: spaces.reduce((n, s) => n + s.collections.length, 0),
        cards: count(spaces),
      },
      skippedEmptyCollections: skipped,
      noteCardsWithoutText: notes,
      unmatchedCollections: unmatched,
      bySpace: spaces.map((s) => ({
        name: s.name,
        collections: s.collections.length,
        cards: s.collections.reduce((n, c) => n + c.cards.length, 0),
      })),
    },
  };
}

/**
 * Toby's default space in each organization has no name ("My Collections" in
 * its UI). When the same name appears in more than one organization, the
 * extra ones get the organization name appended.
 */
function resolveSpaceNames(map: TobySpaceMap): Map<string, string> {
  const named = map.spaces.map((s) => ({ ...s, display: s.name || UNNAMED_SPACE }));
  const seen = new Set<string>();
  const out = new Map<string, string>();
  for (const s of named) {
    out.set(s.id, seen.has(s.display) ? `${s.display} (${s.org})` : s.display);
    seen.add(s.display);
  }
  return out;
}

// ---- Apply -----------------------------------------------------------------

/**
 * Writes the plan in one transaction. 'add' appends the imported spaces after
 * any existing ones; 'replace' wipes MingTab first.
 */
export async function applyImport(db: MingTabDB, plan: ImportPlan, mode: 'add' | 'replace') {
  await db.transaction('rw', db.spaces, db.collections, db.cards, db.tags, async () => {
    if (mode === 'replace') await wipeAll(db);
    const t = Date.now();
    const meta = () => ({ id: crypto.randomUUID(), createdAt: t, updatedAt: t, deletedAt: null });

    let after = await listSpaces(db);
    const spaces: Space[] = [];
    const collections: Collection[] = [];
    const cards: Card[] = [];

    for (const ps of plan.spaces) {
      const space: Space = { ...meta(), name: ps.name, position: positionAfterLast(after) };
      after = [...after, space];
      spaces.push(space);
      const colPos = initialPositions(ps.collections.length);
      ps.collections.forEach((pc, ci) => {
        const col: Collection = {
          ...meta(),
          spaceId: space.id,
          title: pc.title,
          position: colPos[ci]!,
          starred: pc.starred,
          collapsed: false,
          tagIds: [],
        };
        collections.push(col);
        const cardPos = initialPositions(pc.cards.length);
        pc.cards.forEach((c, k) => cards.push({ ...meta(), collectionId: col.id, ...c, position: cardPos[k]! }));
      });
    }
    await db.spaces.bulkAdd(spaces);
    await db.collections.bulkAdd(collections);
    await db.cards.bulkAdd(cards);
  });
}
