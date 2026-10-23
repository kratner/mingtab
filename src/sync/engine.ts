import type Dexie from 'dexie';
import type { MingTabDB } from '../db/db';
import type { Base } from '../db/schema';
import { MAX_CHANGES_PER_REQUEST, SYNC_TABLES, type Change, type Transport } from './protocol';

// Client half of sync. Local edits are found by `updatedAt` (every write sets
// it), so nothing extra is recorded per edit:
//
//   1. t0 = now. Collect records with updatedAt > pushMark.
//   2. Send them in chunks (each request also returns remote changes since the
//      cursor); apply what comes back; advance the cursor.
//   3. Keep pulling while the server says there's more.
//   4. pushMark = t0 - 1. Edits made during the sync have updatedAt >= t0, so
//      the next sync (which takes updatedAt > pushMark) picks them up, even one
//      in the same millisecond the sync started. A record collected at t0 may
//      go out twice; the server ignores the repeat.
//
// Applying a remote record follows the server's rule: newest updatedAt wins;
// on a tie the server's copy wins (it's the one every device will converge to).

export interface SyncCursor {
  cursor: number;
  pushMark: number;
}

export interface SyncStats {
  pushed: number;
  pulled: number;
  applied: number;
  requests: number;
}

const tableOf = (db: MingTabDB, t: Change['table']) => db[t] as unknown as Dexie.Table<Base & Record<string, unknown>, string>;

export async function collectLocalChanges(db: MingTabDB, since: number): Promise<Change[]> {
  const out: Change[] = [];
  for (const t of SYNC_TABLES) {
    const rows = await tableOf(db, t).where('updatedAt').above(since).toArray();
    for (const r of rows) out.push({ table: t, id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt, data: r });
  }
  return out;
}

/** Writes remote records that are at least as new as the local copy. Returns how many were written. */
export async function applyRemoteChanges(db: MingTabDB, changes: Change[]): Promise<number> {
  if (changes.length === 0) return 0;
  let applied = 0;
  await db.transaction('rw', db.spaces, db.collections, db.cards, db.tags, async () => {
    for (const c of changes) {
      const table = tableOf(db, c.table);
      const local = await table.get(c.id);
      if (!local || c.updatedAt >= local.updatedAt) {
        await table.put(c.data as Base & Record<string, unknown>);
        applied++;
      }
    }
  });
  return applied;
}

export async function syncOnce(
  db: MingTabDB,
  transport: Transport,
  state: SyncCursor,
  now: () => number = Date.now,
): Promise<{ state: SyncCursor; stats: SyncStats }> {
  const t0 = now();
  const outgoing = await collectLocalChanges(db, state.pushMark);
  const stats: SyncStats = { pushed: 0, pulled: 0, applied: 0, requests: 0 };
  let cursor = state.cursor;

  const exchange = async (changes: Change[]) => {
    const res = await transport.sync({ cursor, changes });
    stats.requests++;
    stats.pushed += changes.length;
    stats.pulled += res.changes.length;
    stats.applied += await applyRemoteChanges(db, res.changes);
    cursor = res.cursor;
    return res.hasMore;
  };

  let more = false;
  for (let i = 0; i < outgoing.length; i += MAX_CHANGES_PER_REQUEST) {
    more = await exchange(outgoing.slice(i, i + MAX_CHANGES_PER_REQUEST));
  }
  if (outgoing.length === 0) more = await exchange([]);
  while (more) more = await exchange([]);

  return { state: { cursor, pushMark: t0 - 1 }, stats };
}
