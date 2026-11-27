import type { MingTabDB } from '../db/db';
import type { Card, Collection } from '../db/schema';
import { fingerprint, isTobyNoteCard, type TobyExport, type TobySpaceMap } from './toby';

// "Restore dates from Toby": imports before 0.15 stamped every collection with
// the day of the import. Toby's export has no dates, but the space map
// (scripts/toby-space-map.js) records each Toby collection's createdAt by
// fingerprint, and the export gives each fingerprint's title and links. Those
// are matched to the collections in MingTab now, which may since have been
// renamed, merged or de-duplicated, so matching is by title and shared links,
// one Toby collection to one MingTab collection.

export interface DateChange {
  id: string;
  title: string;
  from: number;
  to: number;
}

export interface DateRestorePlan {
  changes: DateChange[];
  /** Toby collections with a date in the space map. */
  dated: number;
  /** Matched, but MingTab's date is already the same or earlier: left alone. */
  alreadyEarlier: number;
  /** Dated Toby collections with no matching collection in MingTab. */
  unmatched: number;
}

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Share of links in common, out of the larger collection. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let n = 0;
  for (const u of a) if (b.has(u)) n++;
  return n / Math.max(a.size, b.size);
}

/** Below this, a collection with a different title isn't taken to be the same one. */
const MIN_OVERLAP_RENAMED = 0.6;

export async function planDateRestore(
  data: TobyExport,
  map: TobySpaceMap,
  collections: Collection[],
  cards: Card[],
): Promise<DateRestorePlan> {
  const dateByFp = new Map<string, number>();
  for (const l of map.lists) {
    const t = l.createdAt ? Date.parse(l.createdAt) : NaN;
    if (Number.isFinite(t)) dateByFp.set(l.fp, t);
  }

  const toby: { title: string; urls: Set<string>; date: number }[] = [];
  for (const l of data.lists) {
    const date = dateByFp.get(await fingerprint(l.title, l.cards.map((c) => c.url)));
    if (date === undefined) continue;
    toby.push({ title: norm(l.title), urls: new Set(l.cards.filter((c) => !isTobyNoteCard(c)).map((c) => c.url)), date });
  }

  const live = collections.filter((c) => c.deletedAt === null);
  const urlsByCol = new Map<string, Set<string>>(live.map((c) => [c.id, new Set()]));
  for (const c of cards) if (c.deletedAt === null && c.url) urlsByCol.get(c.collectionId)?.add(c.url);

  // Score every plausible pair, then take the best pairs first, each side used once.
  const pairs: { t: number; c: Collection; score: number }[] = [];
  toby.forEach((tc, t) => {
    for (const c of live) {
      const o = overlap(tc.urls, urlsByCol.get(c.id)!);
      const sameTitle = norm(c.title) === tc.title;
      if (sameTitle) pairs.push({ t, c, score: 1 + o });
      else if (o >= MIN_OVERLAP_RENAMED) pairs.push({ t, c, score: o });
    }
  });
  pairs.sort((a, b) => b.score - a.score);
  const usedT = new Set<number>();
  const usedC = new Set<string>();
  const changes: DateChange[] = [];
  let alreadyEarlier = 0;
  for (const p of pairs) {
    if (usedT.has(p.t) || usedC.has(p.c.id)) continue;
    usedT.add(p.t);
    usedC.add(p.c.id);
    const to = toby[p.t]!.date;
    // Only ever move a date earlier: a later date would mean the match is wrong or the date is already right.
    if (to < p.c.createdAt) changes.push({ id: p.c.id, title: p.c.title, from: p.c.createdAt, to });
    else alreadyEarlier++;
  }
  changes.sort((a, b) => a.to - b.to);
  return { changes, dated: toby.length, alreadyEarlier, unmatched: toby.length - usedT.size };
}

/** Writes the new dates; updatedAt moves so the change syncs to other devices. */
export async function applyDateRestore(db: MingTabDB, plan: DateRestorePlan) {
  const t = Date.now();
  await db.transaction('rw', db.collections, async () => {
    for (const c of plan.changes) await db.collections.update(c.id, { createdAt: c.to, updatedAt: t });
  });
}
