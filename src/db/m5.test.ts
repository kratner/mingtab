import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MingTabDB } from './db';
import { addToNext, clearDoneNext, listNext, moveNext, removeNext, setNextDone } from './next';
import { addCard, createCollection, createSpace, deleteCard } from './repo';
import { findByShortcut, normalizeShortcut, setCardShortcut, ShortcutError, suggestShortcuts } from './shortcuts';

let db: MingTabDB;
beforeEach(() => {
  db = new MingTabDB(`test-${crypto.randomUUID()}`);
});

describe('Next queue', () => {
  it('adds in order, never twice, reorders, completes and clears', async () => {
    const a = (await addToNext(db, { url: 'https://a.example', title: 'A' })).item;
    const b = (await addToNext(db, { url: 'https://b.example', title: 'B' })).item;
    await addToNext(db, { url: 'https://c.example', title: 'C' });
    expect((await addToNext(db, { url: 'https://a.example', title: 'A again' })).added).toBe(false);
    expect((await listNext(db)).pending.map((n) => n.title)).toEqual(['A', 'B', 'C']);

    await moveNext(db, a.id, b.id);
    expect((await listNext(db)).pending.map((n) => n.title)).toEqual(['B', 'A', 'C']);

    await setNextDone(db, b.id, true);
    let q = await listNext(db);
    expect(q.pending.map((n) => n.title)).toEqual(['A', 'C']);
    expect(q.done.map((n) => n.title)).toEqual(['B']);
    // A done page can be queued again.
    expect((await addToNext(db, { url: 'https://b.example', title: 'B' })).added).toBe(true);

    await setNextDone(db, a.id, true);
    expect(await clearDoneNext(db)).toBe(2);
    q = await listNext(db);
    expect(q.done).toEqual([]);
    await removeNext(db, q.pending[0]!.id);
    expect((await listNext(db)).pending.map((n) => n.title)).toEqual(['B']);
  });
});

describe('to/ shortcuts', () => {
  it('normalizes names', () => {
    expect(normalizeShortcut('  to/Team Docs ')).toBe('team-docs');
    expect(normalizeShortcut('Q4 plan!')).toBe('q4-plan');
  });

  it('sets, finds, rejects duplicates, suggests, and ignores deleted cards', async () => {
    const s = await createSpace(db, 'S');
    const c = await createCollection(db, s.id, 'C');
    const docs = await addCard(db, c.id, { url: 'https://docs.example', title: 'Team docs' });
    const standup = await addCard(db, c.id, { url: 'https://meet.example', title: 'Daily standup' });
    await addCard(db, c.id, { url: 'https://dashboard.example', title: 'Sales dashboard' });

    expect(await setCardShortcut(db, docs.id, 'Docs')).toBe('docs');
    await setCardShortcut(db, standup.id, 'standup');
    await expect(setCardShortcut(db, standup.id, 'docs')).rejects.toBeInstanceOf(ShortcutError);
    expect((await findByShortcut(db, 'DOCS'))?.id).toBe(docs.id);

    expect((await suggestShortcuts(db, 'd')).map((s) => s.title)).toEqual(['Team docs', 'Daily standup', 'Sales dashboard']);
    expect((await suggestShortcuts(db, 'dash')).map((s) => s.title)).toEqual(['Sales dashboard']);
    expect((await suggestShortcuts(db, '')).map((s) => s.shortcut)).toEqual(['docs', 'standup']);

    await deleteCard(db, docs.id);
    expect(await findByShortcut(db, 'docs')).toBeUndefined();
    await setCardShortcut(db, standup.id, ''); // clearing
    expect(await findByShortcut(db, 'standup')).toBeUndefined();
  });
});
