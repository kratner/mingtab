import type { MingTabDB } from '../db/db';
import { wipeAll } from '../db/repo';
import type { Card, Collection, NextItem, Space, Tag } from '../db/schema';
import { ImportError } from './toby';

// MingTab's own backup format: the live records, verbatim. Restoring it makes
// MingTab match the backup exactly (apart from edit timestamps; see restoreAll).

export interface MingTabExport {
  kind: 'mingtab-export';
  version: 1;
  exportedAt: string;
  spaces: Space[];
  collections: Collection[];
  cards: Card[];
  tags: Tag[];
  /** The Next queue (added in M5; absent from older backups). */
  next?: NextItem[];
}

const live = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export async function exportAll(db: MingTabDB): Promise<MingTabExport> {
  const [spaces, collections, cards, tags, next] = await Promise.all([
    db.spaces.filter(live).toArray(),
    db.collections.filter(live).toArray(),
    db.cards.filter(live).toArray(),
    db.tags.filter(live).toArray(),
    db.next.filter(live).toArray(),
  ]);
  return {
    kind: 'mingtab-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    spaces: spaces.sort(byId),
    collections: collections.sort(byId),
    cards: cards.sort(byId),
    tags: tags.sort(byId),
    next: next.sort(byId),
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

/**
 * Makes MingTab match the backup. Everything not in it is marked deleted, and
 * the backup's records are stamped as edited now, so with sync on the restored
 * state wins on every device rather than losing to older copies.
 */
export async function restoreAll(db: MingTabDB, data: MingTabExport) {
  const t = Date.now();
  const touch = <T extends { updatedAt: number }>(rows: T[]) => rows.map((r) => ({ ...r, updatedAt: t }));
  await db.transaction('rw', [db.spaces, db.collections, db.cards, db.tags, db.next], async () => {
    await wipeAll(db, t - 1);
    await db.spaces.bulkPut(touch(data.spaces));
    await db.collections.bulkPut(touch(data.collections));
    await db.cards.bulkPut(touch(data.cards));
    await db.tags.bulkPut(touch(data.tags));
    await db.next.bulkPut(touch(data.next ?? []));
  });
}
