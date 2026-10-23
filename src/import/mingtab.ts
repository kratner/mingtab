import type { MingTabDB } from '../db/db';
import { wipeAll } from '../db/repo';
import type { Card, Collection, Space, Tag } from '../db/schema';
import { ImportError } from './toby';

// MingTab's own backup format: the live records, verbatim. Importing it
// replaces everything, so export → wipe → import round-trips exactly.

export interface MingTabExport {
  kind: 'mingtab-export';
  version: 1;
  exportedAt: string;
  spaces: Space[];
  collections: Collection[];
  cards: Card[];
  tags: Tag[];
}

const live = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export async function exportAll(db: MingTabDB): Promise<MingTabExport> {
  const [spaces, collections, cards, tags] = await Promise.all([
    db.spaces.filter(live).toArray(),
    db.collections.filter(live).toArray(),
    db.cards.filter(live).toArray(),
    db.tags.filter(live).toArray(),
  ]);
  return {
    kind: 'mingtab-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    spaces: spaces.sort(byId),
    collections: collections.sort(byId),
    cards: cards.sort(byId),
    tags: tags.sort(byId),
  };
}

export function parseMingTabExport(raw: unknown): MingTabExport {
  const r = raw as Partial<MingTabExport> | null;
  if (!r || r.kind !== 'mingtab-export' || r.version !== 1) {
    throw new ImportError('Not a MingTab backup (expected kind "mingtab-export", version 1).');
  }
  for (const key of ['spaces', 'collections', 'cards', 'tags'] as const) {
    if (!Array.isArray(r[key])) throw new ImportError(`MingTab backup is missing "${key}".`);
  }
  return r as MingTabExport;
}

export async function restoreAll(db: MingTabDB, data: MingTabExport) {
  await db.transaction('rw', db.spaces, db.collections, db.cards, db.tags, async () => {
    await wipeAll(db);
    await db.spaces.bulkAdd(data.spaces);
    await db.collections.bulkAdd(data.collections);
    await db.cards.bulkAdd(data.cards);
    await db.tags.bulkAdd(data.tags);
  });
}
