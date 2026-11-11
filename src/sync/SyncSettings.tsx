import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { listSpaces } from '../db/repo';
import { endServerSession, signInWithGoogle, signOut } from './auth';
import { connectGoogleDrive, disconnectGoogleDrive } from './drive/auth';
import { isSignedIn, requestSync, useSyncState } from './state';

function ago(t: number | null) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 90) return `${s} seconds ago`;
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  return new Date(t).toLocaleString();
}

export function SyncSettings({
  hiddenSpaces,
  onHiddenSpaces,
}: {
  hiddenSpaces: string[];
  onHiddenSpaces: (ids: string[]) => void;
}) {
  const state = useSyncState();
  const spaces = useLiveQuery(() => listSpaces(db)) ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Every button here runs one async step; the label shows while it's busy.
  const run = (label: string, step: () => Promise<void>) => async () => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await step();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const turnOnDrive = run('drive', async () => {
    const serverToken = state?.backend === 'cloudflare' ? state.token : null;
    await connectGoogleDrive();
    // Moving from the sync server: end that session (data stays on this device and goes up to Drive).
    await endServerSession(serverToken);
    await requestSync('now');
  });
  const signInServer = run('server', async () => {
    await signInWithGoogle();
    await requestSync('now');
  });
  const deleteSynced = run('delete', async () => {
    if (
      !confirm(
        'Delete your synced MingTab data from Google Drive? Every device stops syncing. Collections on this device stay here.',
      )
    )
      return;
    const r = (await chrome.runtime.sendMessage({ type: 'mingtab:drive-delete' })) as
      | { ok: true; count: number }
      | { ok: false; error: string }
      | undefined;
    if (!r?.ok) throw new Error(r?.error ?? 'Could not delete the synced data.');
    setNotice('Your synced data was deleted from Google Drive. Sync is off on this device.');
  });

  if (!state) return null;
  const signedIn = isSignedIn(state);
  const status = state.syncing ? 'Syncing…' : `Last synced ${ago(state.lastSyncAt)}.`;

  return (
    <>
      <section className="settings-section" aria-labelledby="sync-heading">
        <h3 id="sync-heading">Sync</h3>
        {signedIn && state.backend === 'drive' && (
          <>
            <p role="status" aria-label="Sync status">
              Syncing with <b>Google Drive</b> as <b>{state.email}</b>. {state.needsReconnect ? '' : status}
            </p>
            <p className="muted">
              Stored in a hidden MingTab folder in your own Google Drive. MingTab can't see anything else in your Drive.
            </p>
            <div className="row">
              {state.needsReconnect ? (
                <button type="button" className="primary" disabled={!!busy} onClick={turnOnDrive}>
                  {busy === 'drive' ? 'Reconnecting…' : 'Reconnect Google Drive'}
                </button>
              ) : (
                <button type="button" disabled={state.syncing || !!busy} onClick={() => requestSync('now')}>
                  Sync now
                </button>
              )}
              <button
                type="button"
                disabled={!!busy}
                onClick={async () => {
                  if (confirm('Stop syncing on this device? Your collections stay here, and your Google Drive copy stays too.'))
                    await disconnectGoogleDrive();
                }}
              >
                Sign out
              </button>
              <button type="button" disabled={!!busy} onClick={deleteSynced}>
                {busy === 'delete' ? 'Deleting…' : 'Delete synced data'}
              </button>
            </div>
          </>
        )}
        {signedIn && state.backend === 'cloudflare' && (
          <>
            <p role="status" aria-label="Sync status">
              Signed in as <b>{state.email}</b> on the MingTab sync server. {status}
            </p>
            <div className="row">
              <button type="button" disabled={state.syncing} onClick={() => requestSync('now')}>
                Sync now
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Sign this device out of sync? Your collections stay on this device.')) await signOut();
                }}
              >
                Sign out
              </button>
              <button type="button" disabled={!!busy} onClick={turnOnDrive}>
                {busy === 'drive' ? 'Connecting…' : 'Move to Google Drive'}
              </button>
            </div>
          </>
        )}
        {!signedIn && (
          <>
            <p className="muted">
              Keep MingTab the same in every Chrome profile and on every computer. Your collections are stored in a hidden
              MingTab folder in your own Google Drive: no MingTab server, and MingTab can't see anything else in your Drive.
            </p>
            <button type="button" className="primary" disabled={!!busy} onClick={turnOnDrive}>
              {busy === 'drive' ? 'Connecting…' : 'Sync with Google Drive'}
            </button>
            <details className="sync-other">
              <summary>Other ways to sync</summary>
              <p className="muted">
                The MingTab sync server is invite only. It accepts only the Google accounts it was set up for.
              </p>
              <button type="button" disabled={!!busy} onClick={signInServer}>
                {busy === 'server' ? 'Signing in…' : 'Sign in to the MingTab sync server'}
              </button>
            </details>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {(error || state.lastError) && (
          <p className="error" role="alert">
            {error || state.lastError}
          </p>
        )}
      </section>

      {spaces.length > 0 && (
        <section className="settings-section" aria-labelledby="device-spaces">
          <h3 id="device-spaces">Spaces on this device</h3>
          <p className="muted">
            Untick spaces you don't need here (say, personal spaces in your work profile). They keep syncing and stay
            searchable; they just aren't listed.
          </p>
          {spaces.map((s) => (
            <label key={s.id} className="check">
              <input
                type="checkbox"
                checked={!hiddenSpaces.includes(s.id)}
                onChange={(e) =>
                  onHiddenSpaces(e.target.checked ? hiddenSpaces.filter((id) => id !== s.id) : [...hiddenSpaces, s.id])
                }
              />
              {s.name}
            </label>
          ))}
        </section>
      )}
    </>
  );
}
