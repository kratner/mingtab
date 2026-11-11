import { useEffect, useState } from 'react';

// Sync state lives in chrome.storage.local: shared by the background worker
// (which syncs) and the pages (which show status), and kept per Chrome profile.

/**
 * Where this device syncs. 'drive': the person's own Google Drive (hidden app
 * folder), open to anyone. 'cloudflare': the MingTab sync server (invite only).
 * State saved before Drive sync existed has no `backend`: a token means the
 * sync server.
 */
export type SyncBackend = 'cloudflare' | 'drive';

export interface SyncState {
  backend: SyncBackend | null;
  email: string | null;
  /** Device token from the sync server; null when signed out of it. */
  token: string | null;
  cursor: number;
  pushMark: number;
  lastSyncAt: number | null;
  lastError: string | null;
  syncing: boolean;
  /** Drive: access lapsed and couldn't be renewed silently; the person must click Reconnect. */
  needsReconnect: boolean;
  /** Drive: this device's id (names its file); kept across sign-outs so the same file is reused. */
  driveDeviceId: string | null;
  /** Drive: this device's own file, once created. */
  driveFileId: string | null;
  /** Drive: other devices' files → version last merged. */
  driveSeen: Record<string, string>;
}

const KEY = 'mingtab.sync';
export const EMPTY: SyncState = {
  backend: null,
  email: null,
  token: null,
  cursor: 0,
  pushMark: 0,
  lastSyncAt: null,
  lastError: null,
  syncing: false,
  needsReconnect: false,
  driveDeviceId: null,
  driveFileId: null,
  driveSeen: {},
};

function withDefaults(stored: Partial<SyncState> | undefined): SyncState {
  const s = { ...EMPTY, ...stored };
  if (stored && stored.backend === undefined) s.backend = stored.token ? 'cloudflare' : null;
  return s;
}

/** Is this device signed in to a sync backend? */
export const isSignedIn = (s: SyncState) =>
  s.backend === 'drive' ? !!s.email : s.backend === 'cloudflare' ? !!s.token : false;

export async function getSyncState(): Promise<SyncState> {
  const got = await chrome.storage.local.get(KEY);
  return withDefaults(got[KEY] as Partial<SyncState> | undefined);
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
      if (area === 'local' && changes[KEY]) setState(withDefaults(changes[KEY].newValue as Partial<SyncState>));
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  return state;
}

/** Ask the background worker to sync now. Resolves when that sync finishes. */
export const requestSync = (reason: 'now' | 'soon' = 'now') =>
  chrome.runtime.sendMessage({ type: reason === 'now' ? 'mingtab:sync-now' : 'mingtab:sync-soon' }).catch(() => undefined);
