// The sync protocol, server side. One request both pushes a device's changes
// and returns everything changed since the device's cursor.
//
// Conflicts: last writer wins per record, by `updatedAt`. An incoming record
// replaces the stored one only if it is strictly newer, so replays and
// devices re-sending what they just pulled change nothing.

export const TABLES = ['spaces', 'collections', 'cards', 'tags', 'next'] as const;
export type Table = (typeof TABLES)[number];

export interface Change {
  table: Table;
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  data: Record<string, unknown>;
}

export interface SyncRequest {
  cursor: number;
  changes: Change[];
}

export interface SyncResponse {
  cursor: number;
  changes: Change[];
  hasMore: boolean;
  accepted: number;
}

/** Free-plan D1 allows 50 queries per request; each change is one statement. */
export const MAX_CHANGES_PER_REQUEST = 40;
export const PAGE_SIZE = 500;

export class BadRequest extends Error {}

export function validate(body: unknown): SyncRequest {
  const b = body as Partial<SyncRequest> | null;
  if (!b || typeof b.cursor !== 'number' || !Array.isArray(b.changes)) throw new BadRequest('Expected { cursor, changes }');
  if (b.changes.length > MAX_CHANGES_PER_REQUEST) throw new BadRequest(`At most ${MAX_CHANGES_PER_REQUEST} changes per request`);
  for (const c of b.changes) {
    if (!c || !TABLES.includes(c.table) || typeof c.id !== 'string' || !c.id || typeof c.updatedAt !== 'number' || typeof c.data !== 'object') {
      throw new BadRequest('Malformed change');
    }
    if ((c.data as { id?: unknown }).id !== c.id) throw new BadRequest('Change id does not match its data');
  }
  return b as SyncRequest;
}

export async function sync(db: D1Database, userId: string, req: SyncRequest): Promise<SyncResponse> {
  if (req.changes.length) {
    // seq for a write = this user's current max + 1, evaluated per statement;
    // statements in a batch run in order inside one transaction.
    const upsert = db.prepare(
      `INSERT INTO records (user_id, tbl, id, data, updated_at, deleted_at, seq)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records WHERE user_id = ?1))
       ON CONFLICT (user_id, tbl, id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM records WHERE user_id = ?1)
       WHERE excluded.updated_at > records.updated_at`,
    );
    await db.batch(
      req.changes.map((c) => upsert.bind(userId, c.table, c.id, JSON.stringify(c.data), c.updatedAt, c.deletedAt ?? null)),
    );
  }
  const { results } = await db
    .prepare(
      `SELECT tbl, id, data, updated_at, deleted_at, seq FROM records
       WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
    )
    .bind(userId, req.cursor, PAGE_SIZE + 1)
    .all<{ tbl: Table; id: string; data: string; updated_at: number; deleted_at: number | null; seq: number }>();
  const page = results.slice(0, PAGE_SIZE);
  return {
    cursor: page.at(-1)?.seq ?? req.cursor,
    changes: page.map((r) => ({ table: r.tbl, id: r.id, updatedAt: r.updated_at, deletedAt: r.deleted_at, data: JSON.parse(r.data) })),
    hasMore: results.length > PAGE_SIZE,
    accepted: req.changes.length,
  };
}
