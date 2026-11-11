import type Dexie from 'dexie';
import type { MingTabDB } from '../../db/db';
import type { Base } from '../../db/schema';
import { applyRemoteChanges, collectLocalChanges } from '../engine';
import { SYNC_TABLES, type Change, type SyncTable } from '../protocol';
import type { DriveClient, DriveFile } from './client';

// Google Drive sync: no server. Data lives in the hidden app folder
// (appDataFolder) of the person's own Drive, one file per device:
//
//   mingtab-device-<deviceId>.json   a full snapshot of that device's MingTab
//                                    (every record, tombstones included)
//
// Each device writes ONLY its own file and reads everyone else's. Two devices
// syncing at the same moment never write the same file, so neither can
// overwrite the other's edits; there's nothing to lock and no ETag race. The
// merge is the one the Cloudflare sync uses (engine.ts): per record, newest
// updatedAt wins, deletions are tombstones.
//
// One sync:
//   1. t0 = now. Local edits = records with updatedAt > pushMark.
//   2. List the app folder (1 request). Download each other device's file
//      whose Drive `version` changed since we last read it, and merge it in.
//   3. If there were local edits (or we have no file yet), upload our full
//      snapshot, taken after the merge (1 request).
//   4. pushMark = t0 - 1 (edits made during the sync go out next time).
// An idle sync is one request. A remote edit costs each other device one
// download; a local edit costs one upload.
//
// If our own file has disappeared, the synced data was deleted (Settings →
// Delete synced data on another device, or Drive's "Delete hidden app data").
// We stop rather than quietly upload everything again.

export const FILE_PREFIX = 'mingtab-device-';
export const FORMAT = 'mingtab-drive-sync';
export const FORMAT_VERSION = 1;

export interface DriveCursor {
  deviceId: string;
  /** Our own file, once created. */
  fileId: string | null;
  /** Other devices' files: id → Drive version last merged. */
  seen: Record<string, string>;
  pushMark: number;
}

export interface DriveSnapshot {
  format: typeof FORMAT;
  formatVersion: number;
  deviceId: string;
  deviceName: string;
  writtenAt: number;
  tables: Partial<Record<SyncTable, (Base & Record<string, unknown>)[]>>;
}

export interface DriveSyncStats {
  pushed: number;
  downloaded: number;
  applied: number;
  uploaded: boolean;
  requests: number;
}

export class DriveDataDeleted extends Error {
  constructor() {
    super('Your synced data was deleted from Google Drive. Sync is off on this device; your collections are still here.');
  }
}

export class NewerFormatError extends Error {
  constructor() {
    super('Another device synced with a newer MingTab. Update MingTab on this device to keep syncing.');
  }
}

export const fileNameFor = (deviceId: string) => `${FILE_PREFIX}${deviceId}.json`;

const tableOf = (db: MingTabDB, t: SyncTable) => db[t] as unknown as Dexie.Table<Base & Record<string, unknown>, string>;

export async function snapshot(db: MingTabDB, deviceId: string, deviceName: string, now: number): Promise<DriveSnapshot> {
  const tables: DriveSnapshot['tables'] = {};
  for (const t of SYNC_TABLES) tables[t] = await tableOf(db, t).toArray();
  return { format: FORMAT, formatVersion: FORMAT_VERSION, deviceId, deviceName, writtenAt: now, tables };
}

/** Turns another device's file into changes for applyRemoteChanges. Throws on a file this version can't read. */
export function parseSnapshot(text: string): Change[] {
  const s = JSON.parse(text) as Partial<DriveSnapshot>;
  if (s.format !== FORMAT || typeof s.formatVersion !== 'number') throw new Error('Not a MingTab sync file');
  if (s.formatVersion > FORMAT_VERSION) throw new NewerFormatError();
  const out: Change[] = [];
  for (const t of SYNC_TABLES) {
    for (const r of s.tables?.[t] ?? []) {
      if (!r || typeof r.id !== 'string' || typeof r.updatedAt !== 'number') continue;
      out.push({ table: t, id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt ?? null, data: r });
    }
  }
  return out;
}

export async function driveSyncOnce(
  db: MingTabDB,
  drive: DriveClient,
  state: DriveCursor,
  opts: { deviceName: string; now?: () => number },
): Promise<{ state: DriveCursor; stats: DriveSyncStats }> {
  const now = opts.now ?? Date.now;
  const before = drive.requests;
  const t0 = now();
  const outgoing = await collectLocalChanges(db, state.pushMark);
  const stats: DriveSyncStats = { pushed: 0, downloaded: 0, applied: 0, uploaded: false, requests: 0 };

  const ownName = fileNameFor(state.deviceId);
  const files = (await drive.list()).filter((f) => f.name.startsWith(FILE_PREFIX));
  let own: DriveFile | undefined = state.fileId ? files.find((f) => f.id === state.fileId) : files.find((f) => f.name === ownName);
  if (state.fileId && !own) throw new DriveDataDeleted();

  const seen: Record<string, string> = {};
  for (const f of files) {
    if (f.id === own?.id) continue;
    if (state.seen[f.id] === f.version) {
      seen[f.id] = f.version;
      continue;
    }
    const text = await drive.download(f.id);
    stats.downloaded++;
    let changes: Change[];
    try {
      changes = parseSnapshot(text);
    } catch (e) {
      if (e instanceof NewerFormatError) throw e;
      // Damaged or foreign file: skip it (once) instead of failing every sync.
      console.warn(`MingTab sync: skipped unreadable file ${f.name}`, e);
      seen[f.id] = f.version;
      continue;
    }
    stats.applied += await applyRemoteChanges(db, changes);
    seen[f.id] = f.version;
  }

  if (!own || outgoing.length > 0) {
    const body = JSON.stringify(await snapshot(db, state.deviceId, opts.deviceName, now()));
    const props = { device: opts.deviceName.slice(0, 100) };
    own = own ? await drive.update(own.id, body) : await drive.create(ownName, body, props);
    stats.uploaded = true;
    stats.pushed = outgoing.length;
  }

  stats.requests = drive.requests - before;
  return { state: { deviceId: state.deviceId, fileId: own.id, seen, pushMark: t0 - 1 }, stats };
}

/** Deletes every MingTab file in the app folder (all devices' copies). Returns how many. */
export async function deleteAllSyncedData(drive: DriveClient): Promise<number> {
  const files = await drive.list();
  for (const f of files) await drive.remove(f.id);
  return files.length;
}
