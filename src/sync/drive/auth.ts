import { DRIVE_SCOPE, DRIVE_URL, GOOGLE_AUTH_URL, GOOGLE_CLIENT_ID } from '../config';
import { getSyncState, patchSyncState } from '../state';
import { DriveAuthError } from './client';

// Google sign-in for Drive sync. Chrome's web-auth flow (works in Edge,
// Vivaldi and Brave too, and lets the person pick any Google account, unlike
// getAuthToken) with Google's token response: an access token for exactly one
// Drive scope, drive.appdata (MingTab's hidden app folder; it can't see any
// other file), plus an ID token for the email shown in Settings.
//
// Access tokens last about an hour and this flow has no refresh token. When
// one runs out, the background worker asks Google again without showing
// anything (prompt=none, interactive: false). That works while the browser is
// still signed in to that Google account; if not, Settings shows Reconnect.
// Tokens are kept in chrome.storage.session: memory only, gone when the
// browser closes.

const TOKEN_KEY = 'mingtab.driveToken';
const SCOPES = ['openid', 'email', DRIVE_SCOPE];

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  email: string;
}

function claims(idToken: string): { nonce?: string; email?: string } {
  const part = idToken.split('.')[1] ?? '';
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
}

/** Reads Google's redirect (…#access_token=…&id_token=…). Exported for tests. */
export function parseAuthResponse(redirected: string, nonce: string): AuthResult {
  const params = new URLSearchParams(new URL(redirected).hash.slice(1));
  const error = params.get('error');
  if (error === 'access_denied') throw new Error('Google sign-in was cancelled.');
  if (error) throw new Error(`Google sign-in failed: ${error}`);
  const accessToken = params.get('access_token');
  const idToken = params.get('id_token');
  if (!accessToken || !idToken) throw new Error('Google did not return a token.');
  const who = claims(idToken);
  if (who.nonce !== nonce) throw new Error('Sign-in response did not match this request.');
  const granted = (params.get('scope') ?? '').split(/\s+/);
  if (!granted.includes(DRIVE_SCOPE)) {
    throw new Error(
      'MingTab needs permission to use its own hidden folder in your Google Drive to sync. Try again and leave that box ticked.',
    );
  }
  if (!who.email) throw new Error('Google did not say which account signed in.');
  return { accessToken, expiresIn: Number(params.get('expires_in') ?? 3600), email: who.email };
}

async function authorize(opts: { interactive: boolean; email?: string }): Promise<AuthResult> {
  const nonce = crypto.randomUUID();
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'token id_token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: SCOPES.join(' '),
    nonce,
    prompt: opts.interactive ? 'select_account' : 'none',
    ...(opts.email ? { login_hint: opts.email } : {}),
  }).toString();
  let redirected: string | undefined;
  try {
    redirected = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: opts.interactive });
  } catch (e) {
    throw opts.interactive ? new Error(`Google sign-in didn't finish: ${(e as Error).message}`) : new DriveAuthError((e as Error).message);
  }
  if (!redirected) throw new Error('Sign-in was cancelled.');
  return parseAuthResponse(redirected, nonce);
}

async function storeToken(r: AuthResult) {
  const value: StoredToken = { accessToken: r.accessToken, expiresAt: Date.now() + r.expiresIn * 1000 };
  await chrome.storage.session.set({ [TOKEN_KEY]: value });
}

export async function clearDriveToken() {
  await chrome.storage.session.remove(TOKEN_KEY);
}

/**
 * A usable access token. `fresh` (the API just refused the current one) or an
 * expired token triggers a silent renewal; if that fails the caller gets a
 * DriveAuthError and the person has to reconnect.
 */
export async function getDriveToken(fresh = false): Promise<string> {
  if (!fresh) {
    const t = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY] as StoredToken | undefined;
    if (t && t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  }
  const { email } = await getSyncState();
  let r: AuthResult;
  try {
    r = await authorize({ interactive: false, email: email ?? undefined });
  } catch (e) {
    throw e instanceof DriveAuthError ? e : new DriveAuthError((e as Error).message);
  }
  if (email && r.email.toLowerCase() !== email.toLowerCase()) throw new DriveAuthError('A different Google account answered.');
  await storeToken(r);
  return r.accessToken;
}

/** The Drive API host MingTab must be allowed to reach (asked for when sync is turned on, not at install). */
export const driveOrigins = () => [`${new URL(DRIVE_URL).origin}/*`];

/**
 * Turn on Drive sync (or reconnect). Must run from a click: Chrome only shows
 * the permission prompt during a user gesture, so it's requested first.
 */
export async function connectGoogleDrive(): Promise<string> {
  const ok = await chrome.permissions.request({ origins: driveOrigins() });
  if (!ok) throw new Error('MingTab needs to reach Google Drive (www.googleapis.com) to sync there.');
  const before = await getSyncState();
  const r = await authorize({ interactive: true });
  await storeToken(r);
  const reconnect = before.backend === 'drive' && before.email?.toLowerCase() === r.email.toLowerCase();
  await patchSyncState({
    backend: 'drive',
    email: r.email,
    token: null,
    cursor: 0,
    needsReconnect: false,
    lastError: null,
    driveDeviceId: before.driveDeviceId ?? crypto.randomUUID(),
    // A different account (or first time): start over, so everything here goes up.
    ...(reconnect ? {} : { pushMark: 0, driveFileId: null, driveSeen: {}, lastSyncAt: null }),
  });
  return r.email;
}

/** Stop syncing on this device. Collections stay here; Drive keeps its copy. */
export async function disconnectGoogleDrive() {
  await clearDriveToken();
  await patchSyncState({
    backend: null,
    email: null,
    pushMark: 0,
    driveFileId: null,
    driveSeen: {},
    needsReconnect: false,
    lastError: null,
    lastSyncAt: null,
  });
}
