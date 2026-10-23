import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { listSpaces } from '../db/repo';
import { signInWithGoogle, signOut } from './auth';
import { requestSync, useSyncState } from './state';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
      await requestSync('now');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const signedIn = !!state.token;

  return (
    <>
      <section className="settings-section" aria-labelledby="sync-heading">
        <h3 id="sync-heading">Sync</h3>
        {signedIn ? (
          <>
            <p role="status" aria-label="Sync status">
              Signed in as <b>{state.email}</b>.{' '}
              {state.syncing ? 'Syncing…' : `Last synced ${ago(state.lastSyncAt)}.`}
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
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Keep MingTab the same in every Chrome profile and on every computer. Sign in with your Google account; your
              collections are stored in your own MingTab sync service and nowhere else.
            </p>
            <button type="button" className="primary" disabled={busy} onClick={signIn}>
              {busy ? 'Signing in…' : 'Sign in with Google'}
            </button>
          </>
        )}
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
