import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MingTabDB } from '../../db/db';
import { addCard, createCollection, createSpace, deleteCollection, listCards, listCollections, listSpaces } from '../../db/repo';
import { DriveAuthError, DriveClient } from './client';
import { DriveDataDeleted, deleteAllSyncedData, driveSyncOnce, fileNameFor, FORMAT, type DriveCursor } from './engine';
import { FakeDrive } from './fake';

const tick = () => new Promise((r) => setTimeout(r, 3));

class Device {
  db = new MingTabDB(`drive-device-${crypto.randomUUID()}`);
  state: DriveCursor = { deviceId: crypto.randomUUID(), fileId: null, seen: {}, pushMark: 0 };
  token: string;
  drive: DriveClient;
  constructor(
    readonly fake: FakeDrive,
    readonly name = 'Chrome',
    opts: { simpleUploadLimit?: number } = {},
  ) {
    this.token = fake.issueToken();
    this.drive = new DriveClient({
      baseUrl: fake.baseUrl,
      fetch: fake.fetch,
      getToken: async (fresh) => (fresh ? (this.token = fake.issueToken()) : this.token),
      ...opts,
    });
  }
  async sync() {
    // Real syncs are seconds apart; a record stamped in the very millisecond a
    // sync starts is (by design) sent again next time, which would skew counts.
    await tick();
    const r = await driveSyncOnce(this.db, this.drive, this.state, { deviceName: this.name });
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
  return out.sort();
};

describe('Google Drive sync', () => {
  it('a new device receives everything; one file per device in the app folder', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    const b = new Device(fake);
    const s = await createSpace(a.db, 'Work');
    const c = await createCollection(a.db, s.id, 'Reading');
    await addCard(a.db, c.id, { url: 'https://1.example', title: 'One' });

    const first = await a.sync();
    expect(first).toMatchObject({ uploaded: true, pushed: 3, downloaded: 0 });
    await b.sync();
    expect(await titles(b.db)).toEqual(['Work/Reading', 'Work/Reading/One']);

    const files = fake.filesOf();
    expect(files.map((f) => f.name).sort()).toEqual([fileNameFor(a.state.deviceId), fileNameFor(b.state.deviceId)].sort());
    const snap = JSON.parse(files.find((f) => f.name === fileNameFor(a.state.deviceId))!.content);
    expect(snap).toMatchObject({ format: FORMAT, formatVersion: 1, deviceId: a.state.deviceId });
    expect(snap.tables.cards).toHaveLength(1);
  });

  it('an idle sync is one request; a remote change costs one download, a local edit one upload', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    const b = new Device(fake);
    const s = await createSpace(a.db, 'Work');
    await a.sync();
    await b.sync();
    await a.sync();

    expect(await a.sync()).toMatchObject({ requests: 1, uploaded: false, downloaded: 0 });
    expect(await b.sync()).toMatchObject({ requests: 1, uploaded: false, downloaded: 0 });

    await tick();
    await a.db.spaces.update(s.id, { name: 'Renamed', updatedAt: Date.now() });
    await tick(); // keep the edit's millisecond apart from B's sync start (else it looks local to B too)
    expect(await a.sync()).toMatchObject({ requests: 2, uploaded: true, downloaded: 0 });
    expect(await b.sync()).toMatchObject({ requests: 2, uploaded: false, downloaded: 1 });
    expect((await b.db.spaces.get(s.id))!.name).toBe('Renamed');
    expect(await b.sync()).toMatchObject({ requests: 1 });
  });

  it('two devices syncing at the same moment both keep their edits', async () => {
    const fake = new FakeDrive({ latency: 5 });
    const a = new Device(fake, 'Mac');
    const b = new Device(fake, 'PC');
    const s = await createSpace(a.db, 'Work');
    const c = await createCollection(a.db, s.id, 'Shared');
    await a.sync();
    await b.sync();

    // Both edit offline, then sync concurrently: list, list, upload, upload.
    await a.db.collections.update(c.id, { title: 'Renamed on Mac', updatedAt: Date.now() + 10 });
    await addCard(a.db, c.id, { url: 'https://mac.example', title: 'From Mac' });
    await addCard(b.db, c.id, { url: 'https://pc.example', title: 'From PC' });
    await createCollection(b.db, s.id, 'PC only');
    const order: string[] = [];
    const log = fake.log;
    log.length = 0;
    await Promise.all([a.sync(), b.sync()]);
    order.push(...log);
    // The race really happened: both listed before either uploaded.
    const firstUpload = order.findIndex((l) => l.startsWith('PATCH'));
    expect(order.slice(0, firstUpload).filter((l) => l === 'GET /drive/v3/files')).toHaveLength(2);

    await Promise.all([a.sync(), b.sync()]);
    const expected = ['Work/PC only', 'Work/Renamed on Mac', 'Work/Renamed on Mac/From Mac', 'Work/Renamed on Mac/From PC'];
    expect(await titles(a.db)).toEqual(expected);
    expect(await titles(b.db)).toEqual(expected);
  });

  it('the same record edited on both at once: the later edit wins on both', async () => {
    const fake = new FakeDrive({ latency: 3 });
    const a = new Device(fake);
    const b = new Device(fake);
    const s = await createSpace(a.db, 'Work');
    const c = await createCollection(a.db, s.id, 'Original');
    await a.sync();
    await b.sync();

    const t = Date.now();
    await a.db.collections.update(c.id, { title: 'A, earlier', updatedAt: t + 1000 });
    await b.db.collections.update(c.id, { title: 'B, later', updatedAt: t + 2000 });
    await Promise.all([a.sync(), b.sync()]);
    await Promise.all([a.sync(), b.sync()]);
    expect((await a.db.collections.get(c.id))!.title).toBe('B, later');
    expect((await b.db.collections.get(c.id))!.title).toBe('B, later');
  });

  it('deletions propagate as tombstones', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    const b = new Device(fake);
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

  it('both devices had data before signing in: everything merges', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    const b = new Device(fake);
    await createCollection(a.db, (await createSpace(a.db, 'Mac space')).id, 'From Mac');
    await createCollection(b.db, (await createSpace(b.db, 'PC space')).id, 'From PC');
    await a.sync();
    await b.sync();
    await a.sync();
    const expected = ['Mac space/From Mac', 'PC space/From PC'];
    expect(await titles(a.db)).toEqual(expected);
    expect(await titles(b.db)).toEqual(expected);
  });

  it('an expired token is renewed once and the request retried', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    await createSpace(a.db, 'Work');
    fake.expireAllTokens();
    expect((await a.sync()).uploaded).toBe(true);
    expect(fake.log.filter((l) => l === 'GET /drive/v3/files')).toHaveLength(2); // 401, then retry
  });

  it('a refused renewal surfaces as DriveAuthError', async () => {
    const fake = new FakeDrive();
    const db = new MingTabDB(`drive-device-${crypto.randomUUID()}`);
    const drive = new DriveClient({
      baseUrl: fake.baseUrl,
      fetch: fake.fetch,
      getToken: async (fresh) => {
        if (fresh) throw new Error('interaction_required');
        return 'stale-token';
      },
    });
    await expect(
      driveSyncOnce(db, drive, { deviceId: 'd', fileId: null, seen: {}, pushMark: 0 }, { deviceName: 'x' }),
    ).rejects.toBeInstanceOf(DriveAuthError);
  });

  it('large snapshots go up with a resumable upload', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake, 'Mac', { simpleUploadLimit: 200 });
    const c = await createCollection(a.db, (await createSpace(a.db, 'Big')).id, 'Lots');
    for (let i = 0; i < 20; i++) await addCard(a.db, c.id, { url: `https://${i}.example`, title: `${i}` });
    await a.sync(); // create
    await addCard(a.db, c.id, { url: 'https://more.example', title: 'more' });
    await a.sync(); // update
    expect(fake.log.filter((l) => l.endsWith('?resumable'))).toEqual([
      'POST /upload/drive/v3/files?resumable',
      'PUT /upload/drive/v3/files?resumable',
      'PATCH /upload/drive/v3/files/file-2?resumable',
      'PUT /upload/drive/v3/files?resumable',
    ].map((l) => l.replace('file-2', a.state.fileId!)));
    const b = new Device(fake);
    await b.sync();
    expect(await b.db.cards.count()).toBe(21);
  });

  it('delete synced data: the files go, and other devices stop instead of re-uploading', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    const b = new Device(fake);
    await createSpace(a.db, 'Work');
    await a.sync();
    await b.sync();
    expect(fake.filesOf()).toHaveLength(2);

    expect(await deleteAllSyncedData(b.drive)).toBe(2);
    expect(fake.filesOf()).toHaveLength(0);
    await expect(a.sync()).rejects.toBeInstanceOf(DriveDataDeleted);
    expect(fake.filesOf()).toHaveLength(0);
    expect(await a.db.spaces.count()).toBe(1); // local data untouched
  });

  it("only sees its own account's app folder", async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    await createSpace(a.db, 'Mine');
    await a.sync();
    const other = new Device(fake);
    other.token = fake.issueToken('someone-else@example.com');
    await other.sync();
    expect(await other.db.spaces.count()).toBe(0);
  });

  it('skips a damaged file once instead of failing every sync', async () => {
    const fake = new FakeDrive();
    const a = new Device(fake);
    await createSpace(a.db, 'Work');
    await a.sync();
    const f = fake.filesOf()[0]!;
    f.content = '{not json';
    f.version++;
    const b = new Device(fake);
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect((await b.sync()).downloaded).toBe(1);
      expect((await b.sync()).downloaded).toBe(0);
    } finally {
      console.warn = warn;
    }
  });
});
