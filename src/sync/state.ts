import { useEffect, useState } from 'react';

// Sync state lives in chrome.storage.local: shared by the background worker
// (which syncs) and the pages (which show status), and kept per Chrome profile.

export interface SyncState {
  email: string | null;
  /** Device token from the sync service; null when signed out. */
  token: string | null;
  cursor: number;
  pushMark: number;
  lastSyncAt: number | null;
  lastError: string | null;
  syncing: boolean;
}

const KEY = 'mingtab.sync';
export const EMPTY: SyncState = {
  email: null,
  token: null,
  cursor: 0,
  pushMark: 0,
  lastSyncAt: null,
  lastError: null,
  syncing: false,
};

export async function getSyncState(): Promise<SyncState> {
  const got = await chrome.storage.local.get(KEY);
  return { ...EMPTY, ...(got[KEY] as Partial<SyncState> | undefined) };
}

export async function patchSyncState(patch: Partial<SyncState>): Promise<SyncState> {
  const next = { ...(await getSyncState()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function useSyncState(): SyncState | null {
  const [state, setState] = useState<SyncState | null>(null);
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    void getSyncState().then(setState);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[KEY]) setState({ ...EMPTY, ...(changes[KEY].newValue as Partial<SyncState>) });
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  return state;
}

/** Ask the background worker to sync now. Resolves when that sync finishes. */
export const requestSync = (reason: 'now' | 'soon' = 'now') =>
  chrome.runtime.sendMessage({ type: reason === 'now' ? 'mingtab:sync-now' : 'mingtab:sync-soon' }).catch(() => undefined);
