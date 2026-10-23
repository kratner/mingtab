import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MingTabDB } from '../db/db';
import { addCard, createCollection, createSpace, deleteCollection, listCards, listCollections, listSpaces } from '../db/repo';
import { syncOnce, type SyncCursor } from './engine';
import type { Change, SyncRequest, SyncResponse, Transport } from './protocol';

/** In-memory stand-in for the Worker, with the same rules (worker/src/sync.ts). */
class FakeServer implements Transport {
  records = new Map<string, Change & { seq: number }>();
  seq = 0;
  requests: SyncRequest[] = [];
  pageSize = 500;

  async sync(req: SyncRequest): Promise<SyncResponse> {
    this.requests.push(req);
    if (req.changes.length > 40) throw new Error('too many changes in one request');
    for (const c of req.changes) {
      const key = `${c.table}:${c.id}`;
      const existing = this.records.get(key);
      if (!existing || c.updatedAt > existing.updatedAt) this.records.set(key, { ...structuredClone(c), seq: ++this.seq });
    }
    const after = [...this.records.values()].filter((r) => r.seq > req.cursor).sort((a, b) => a.seq - b.seq);
    const page = after.slice(0, this.pageSize);
    return {
      cursor: page.at(-1)?.seq ?? req.cursor,
      changes: page.map(({ seq: _s, ...c }) => structuredClone(c)),
      hasMore: after.length > this.pageSize,
      accepted: req.changes.length,
    };
  }
}

class Device {
  db = new MingTabDB(`device-${crypto.randomUUID()}`);
  state: SyncCursor = { cursor: 0, pushMark: 0 };
  constructor(private server: FakeServer) {}
  async sync() {
    const r = await syncOnce(this.db, this.server, this.state);
    this.state = r.state;
    return r.stats;
  }
}

const titles = async (db: MingTabDB) => {
  const out: string[] = [];
  for (const s of await listSpaces(db))
    for (const c of await listCollections(db, s.id)) {
      out.push(`${s.name}/${c.title}`);
      for (const k of await listCards(db, c.id)) out.push(`${s.name}/${c.title}/${k.title}`);
    }
  return out;
};

describe('sync engine', () => {
  it('a new device receives everything; nothing is pushed back twice', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const b = new Device(server);
    const s = await createSpace(a.db, 'Work');
    const c = await createCollection(a.db, s.id, 'Reading');
    await addCard(a.db, c.id, { url: 'https://1.example', title: 'One' });
    await addCard(a.db, c.id, { url: 'https://2.example', title: 'Two' });

    expect((await a.sync()).pushed).toBe(4);
    await b.sync();
    expect(await titles(b.db)).toEqual(['Work/Reading', 'Work/Reading/One', 'Work/Reading/Two']);

    // Second round: nothing new anywhere.
    expect((await a.sync()).pushed).toBe(0);
    expect((await b.sync()).pushed).toBe(0);
  });

  it('offline edits on two devices both survive', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const b = new Device(server);
    const s = await createSpace(a.db, 'Work');
    const c = await createCollection(a.db, s.id, 'Reading');
    await a.sync();
    await b.sync();

    // Offline: A renames the collection, B adds a card to it.
    await a.db.collections.update(c.id, { title: 'Reading list', updatedAt: Date.now() + 1 });
    await addCard(b.db, c.id, { url: 'https://new.example', title: 'New' });

    await a.sync();
    await b.sync();
    await a.sync();
    const expected = ['Work/Reading list', 'Work/Reading list/New'];
    expect(await titles(a.db)).toEqual(expected);
    expect(await titles(b.db)).toEqual(expected);
  });

  it('the same record edited on both: the later edit wins everywhere', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const b = new Device(server);
    const s = await createSpace(a.db, 'Work');
    const c = await createCollection(a.db, s.id, 'Original');
    await a.sync();
    await b.sync();

    const t = Date.now();
    await b.db.collections.update(c.id, { title: 'B, later', updatedAt: t + 2000 });
    await a.db.collections.update(c.id, { title: 'A, earlier', updatedAt: t + 1000 });
    await b.sync(); // later edit reaches the server first
    await a.sync(); // A's earlier edit loses, and A takes B's
    await b.sync();
    expect((await a.db.collections.get(c.id))!.title).toBe('B, later');
    expect((await b.db.collections.get(c.id))!.title).toBe('B, later');
  });

  it('deletions propagate (collection and its cards)', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const b = new Device(server);
    const s = await createSpace(a.db, 'Work');
    const c = await createCollection(a.db, s.id, 'Old');
    await addCard(a.db, c.id, { url: 'https://x.example', title: 'x' });
    await a.sync();
    await b.sync();
    expect(await titles(b.db)).toHaveLength(2);

    await deleteCollection(a.db, c.id);
    await a.sync();
    await b.sync();
    expect(await titles(b.db)).toEqual([]);
  });

  it('sends at most 40 changes per request', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const s = await createSpace(a.db, 'Big');
    const c = await createCollection(a.db, s.id, 'Lots');
    for (let i = 0; i < 98; i++) await addCard(a.db, c.id, { url: `https://${i}.example`, title: `${i}` });
    const stats = await a.sync();
    expect(stats.pushed).toBe(100);
    expect(server.requests.map((r) => r.changes.length)).toEqual([40, 40, 20]);
    expect(server.records.size).toBe(100);
  });

  it('pulls in pages until the server has nothing more', async () => {
    const server = new FakeServer();
    server.pageSize = 50;
    const a = new Device(server);
    const s = await createSpace(a.db, 'Big');
    const c = await createCollection(a.db, s.id, 'Lots');
    for (let i = 0; i < 118; i++) await addCard(a.db, c.id, { url: `https://${i}.example`, title: `${i}` });
    await a.sync();

    const b = new Device(server);
    const stats = await b.sync();
    expect(stats.pulled).toBe(120);
    expect(await b.db.cards.count()).toBe(118);
  });

  it('an edit made while a sync is running is sent next time, even in the same millisecond', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const s = await createSpace(a.db, 'Work');
    let clock = Date.now() + 1000;
    a.state = (await syncOnce(a.db, server, a.state, () => clock)).state;
    // An edit stamped with exactly the sync's start time (t0).
    await a.db.spaces.update(s.id, { name: 'Renamed', updatedAt: clock });
    clock += 10;
    const r2 = await syncOnce(a.db, server, a.state, () => clock);
    expect(r2.stats.pushed).toBe(1);
    expect(server.records.get(`spaces:${s.id}`)!.data.name).toBe('Renamed');
  });
});
