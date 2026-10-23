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

    const strip = ({ exportedAt: _e, ...rest }: typeof first) => rest;
    expect(strip(second)).toEqual(strip(first));
  });

  it('rejects files that are not MingTab backups', () => {
    expect(() => parseMingTabExport({ version: 3, lists: [] })).toThrow(/Not a MingTab backup/);
  });
});
