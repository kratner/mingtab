import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MingTabDB } from '../db/db';
import { addCard, createCollection, createSpace, deleteCard, updateCard } from '../db/repo';
import { exportAll, parseMingTabExport, restoreAll } from './mingtab';

describe('MingTab backup', () => {
  it('export → wipe → import round-trips exactly', async () => {
    const db = new MingTabDB(`test-${crypto.randomUUID()}`);
    const s = await createSpace(db, 'Work');
    const c = await createCollection(db, s.id, 'Today');
    const k = await addCard(db, c.id, { url: 'https://a.example', title: 'A', favIconUrl: 'data:image/png;base64,AA' });
    await updateCard(db, k.id, { note: 'note ✓ ünïcode' });
    const gone = await addCard(db, c.id, { url: 'https://deleted.example' });
    await deleteCard(db, gone.id);

    const first = await exportAll(db);
    expect(first.cards).toHaveLength(1); // tombstones are not exported

    const fresh = new MingTabDB(`test-${crypto.randomUUID()}`);
    await restoreAll(fresh, parseMingTabExport(JSON.parse(JSON.stringify(first))));
    const second = await exportAll(fresh);

    // Same records and content; only edit timestamps move (restore stamps them as new).
    const strip = ({ exportedAt: _e, ...rest }: typeof first) =>
      Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, Array.isArray(v) ? v.map(({ updatedAt: _u, ...r }) => r) : v]),
      );
    expect(strip(second)).toEqual(strip(first));
  });

  it('restoring over existing data marks the rest deleted (so sync propagates it)', async () => {
    const db = new MingTabDB(`test-${crypto.randomUUID()}`);
    const keep = await createSpace(db, 'Keep');
    const backup = await exportAll(db);
    const extra = await createSpace(db, 'Added after backup');
    await restoreAll(db, backup);
    expect((await db.spaces.get(extra.id))!.deletedAt).not.toBeNull();
    const kept = (await db.spaces.get(keep.id))!;
    expect(kept.deletedAt).toBeNull();
    expect(kept.updatedAt).toBeGreaterThan(keep.updatedAt);
  });

  it('rejects files that are not MingTab backups', () => {
    expect(() => parseMingTabExport({ version: 3, lists: [] })).toThrow(/Not a MingTab backup/);
  });
});
