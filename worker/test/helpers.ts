import { env, SELF } from 'cloudflare:test';

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/**
 * A Google-style ID token signed with the test key. Override any claim.
 * Each call is a different Google account unless `sub` is passed, so tests
 * don't see each other's records.
 */
export async function idToken(claims: Record<string, unknown> = {}) {
  const jwk = JSON.parse(env.TEST_PRIVATE_JWK) as JsonWebKey & { kid: string };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const header = enc({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' });
  const payload = enc({
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_CLIENT_ID,
    sub: `google-sub-${crypto.randomUUID()}`,
    email: 'keith.ratner@gmail.com',
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 600,
    ...claims,
  });
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}

export const api = (path: string, init: RequestInit = {}) => SELF.fetch(`https://sync.test${path}`, init);

export async function signIn(claims: Record<string, unknown> = {}, deviceName = 'Test device') {
  const res = await api('/v1/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken: await idToken(claims), deviceName }),
  });
  return { res, body: (await res.json()) as { token?: string; email?: string; error?: string } };
}

export async function syncAs(token: string, cursor: number, changes: unknown[] = []) {
  const res = await api('/v1/sync', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ cursor, changes }),
  });
  return { res, body: (await res.json()) as { cursor: number; changes: { id: string; data: { title?: string } }[]; hasMore: boolean; error?: string } };
}

export const card = (id: string, title: string, updatedAt: number, deletedAt: number | null = null) => ({
  table: 'cards',
  id,
  updatedAt,
  deletedAt,
  data: { id, title, url: `https://${id}.example`, updatedAt, deletedAt },
});
