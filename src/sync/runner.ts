import { db } from '../db/db';
import { SYNC_URL } from './config';
import { collectLocalChanges, syncOnce } from './engine';
import type { SyncRequest, SyncResponse, Transport } from './protocol';
import { getSyncState, patchSyncState } from './state';

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
