import { db } from '../db/db';
import { deviceName } from './auth';
import { DRIVE_URL, SYNC_URL } from './config';
import { disconnectGoogleDrive, getDriveToken } from './drive/auth';
import { DriveAuthError, DriveClient, DriveError } from './drive/client';
import { DriveDataDeleted, deleteAllSyncedData, driveSyncOnce } from './drive/engine';
import { collectLocalChanges, syncOnce } from './engine';
import type { SyncRequest, SyncResponse, Transport } from './protocol';
import { getSyncState, patchSyncState, type SyncState } from './state';

// Runs in the background service worker. One sync at a time; callers that
// arrive mid-sync share the running one.

class HttpTransport implements Transport {
  constructor(private token: string) {}
  async sync(req: SyncRequest): Promise<SyncResponse> {
    const res = await fetch(`${SYNC_URL}/v1/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw Object.assign(new Error(body.error ?? `Sync service error (${res.status})`), { status: res.status });
    }
    return res.json() as Promise<SyncResponse>;
  }
}

let running: Promise<void> | null = null;

export function runSync(opts: { onlyIfChanged?: boolean } = {}): Promise<void> {
  running ??= doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doSync({ onlyIfChanged }: { onlyIfChanged?: boolean }) {
  const state = await getSyncState();
  if (state.backend === 'drive') return doDriveSync(state, !!onlyIfChanged);
  if (!state.token) return;
  // "sync soon" after a local edit: skip if nothing local changed (e.g. the
  // edit was this worker applying remote changes).
  if (onlyIfChanged && (await collectLocalChanges(db, state.pushMark)).length === 0) return;
  await patchSyncState({ syncing: true });
  try {
    const { state: cursor } = await syncOnce(db, new HttpTransport(state.token), state);
    await patchSyncState({ ...cursor, lastSyncAt: Date.now(), lastError: null, syncing: false });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) {
      await patchSyncState({ token: null, syncing: false, lastError: 'This device was signed out. Sign in again to keep syncing.' });
    } else {
      await patchSyncState({ syncing: false, lastError: (e as Error).message || 'Sync failed' });
    }
  }
}

export const driveClient = () => new DriveClient({ baseUrl: DRIVE_URL, getToken: getDriveToken });

async function doDriveSync(state: SyncState, onlyIfChanged: boolean) {
  if (!state.email || !state.driveDeviceId) return;
  // Waiting for the person to click Reconnect; silent renewal already failed.
  if (state.needsReconnect) return;
  if (onlyIfChanged && (await collectLocalChanges(db, state.pushMark)).length === 0) return;
  await patchSyncState({ syncing: true });
  try {
    const { state: next } = await driveSyncOnce(
      db,
      driveClient(),
      { deviceId: state.driveDeviceId, fileId: state.driveFileId, seen: state.driveSeen, pushMark: state.pushMark },
      { deviceName: deviceName() },
    );
    await patchSyncState({
      driveFileId: next.fileId,
      driveSeen: next.seen,
      pushMark: next.pushMark,
      lastSyncAt: Date.now(),
      lastError: null,
      syncing: false,
    });
  } catch (e) {
    if (e instanceof DriveAuthError) {
      await patchSyncState({
        syncing: false,
        needsReconnect: true,
        lastError: 'MingTab lost access to Google Drive. Click Reconnect to keep syncing.',
      });
    } else if (e instanceof DriveDataDeleted) {
      // Turned off here; local collections stay. Turning sync on again uploads them afresh.
      await patchSyncState({
        backend: null,
        email: null,
        syncing: false,
        pushMark: 0,
        driveFileId: null,
        driveSeen: {},
        lastSyncAt: null,
        lastError: e.message,
      });
    } else if (e instanceof DriveError && (e.status === 403 || e.status === 429) && /rate|limit/i.test(`${e.reason} ${e.message}`)) {
      await patchSyncState({ syncing: false, lastError: 'Google Drive asked MingTab to slow down; it will try again shortly.' });
    } else {
      await patchSyncState({ syncing: false, lastError: (e as Error).message || 'Sync failed' });
    }
  }
}

/**
 * Settings → Delete synced data: removes every MingTab file from the app
 * folder, then turns sync off on this device. Runs in the background worker,
 * after any sync in progress, and no sync can start until it's done. Other
 * devices notice their file is gone on their next sync and turn off too.
 */
export async function deleteDriveData(): Promise<number> {
  while (running) await running.catch(() => {});
  let count = 0;
  running = (async () => {
    count = await deleteAllSyncedData(driveClient());
    await disconnectGoogleDrive();
  })().finally(() => {
    running = null;
  });
  await running;
  return count;
}
