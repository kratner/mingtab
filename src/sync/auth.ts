import { GOOGLE_CLIENT_ID, SYNC_URL } from './config';
import { getSyncState, patchSyncState } from './state';

// Google sign-in through Chrome's web-auth flow (not getAuthToken, which is
// tied to the Chrome profile's own account: the work profile would sign in as
// the work account). Google returns an ID token; the sync service checks it
// and issues this device its own token.

function deviceName() {
  const ua = navigator.userAgent;
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `Chrome on ${os}`;
}

function claims(idToken: string): { nonce?: string; email?: string } {
  const part = idToken.split('.')[1] ?? '';
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
}

export async function signInWithGoogle(): Promise<string> {
  const nonce = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'id_token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  }).toString();

  const redirected = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
  if (!redirected) throw new Error('Sign-in was cancelled.');
  const params = new URLSearchParams(new URL(redirected).hash.slice(1));
  if (params.get('error')) throw new Error(`Google sign-in failed: ${params.get('error')}`);
  const idToken = params.get('id_token');
  if (!idToken) throw new Error('Google did not return an ID token.');
  if (claims(idToken).nonce !== nonce) throw new Error('Sign-in response did not match this request.');

  const res = await fetch(`${SYNC_URL}/v1/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken, deviceName: deviceName() }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; email?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? `Sync service error (${res.status})`);
  // Fresh start: push everything local, pull everything remote.
  await patchSyncState({ token: body.token, email: body.email ?? null, cursor: 0, pushMark: 0, lastError: null });
  return body.email ?? '';
}

export async function signOut() {
  const { token } = await getSyncState();
  if (token) {
    await fetch(`${SYNC_URL}/v1/auth/signout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  }
  await patchSyncState({ token: null, email: null, cursor: 0, pushMark: 0, lastError: null, lastSyncAt: null });
}
