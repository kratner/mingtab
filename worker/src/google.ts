// Verifies a Google ID token (a signed JWT) without any library: checks the
// RS256 signature against Google's published keys, then issuer, audience,
// expiry and that the email is verified.

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export type JwkSet = { keys: (JsonWebKey & { kid: string })[] };
export type KeySource = () => Promise<JwkSet>;

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
let cached: { keys: JwkSet; until: number } | null = null;

/** Google's keys, cached in memory for an hour. */
export const googleKeys: KeySource = async () => {
  if (cached && cached.until > Date.now()) return cached.keys;
  const res = await fetch(GOOGLE_CERTS);
  if (!res.ok) throw new Error(`Fetching Google keys failed: ${res.status}`);
  const keys = (await res.json()) as JwkSet;
  cached = { keys, until: Date.now() + 3600_000 };
  return keys;
};

const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const b64urlJson = (s: string) => {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
  } catch {
    throw new AuthError('Malformed token');
  }
};

export class AuthError extends Error {}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  keys: KeySource,
  now = Date.now(),
): Promise<GoogleIdentity> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token');
  const [h, p, sig] = parts as [string, string, string];
  const header = b64urlJson(h) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new AuthError('Unexpected token algorithm');

  const jwk = (await keys()).keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new AuthError('Unknown signing key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  let signature: Uint8Array;
  try {
    signature = b64urlToBytes(sig);
  } catch {
    throw new AuthError('Malformed token');
  }
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new AuthError('Bad signature');

  const claims = b64urlJson(p) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') throw new AuthError('Wrong issuer');
  if (claims.aud !== clientId) throw new AuthError('Token is for another app');
  if (!claims.exp || claims.exp * 1000 < now - 60_000) throw new AuthError('Token expired');
  if (!claims.sub || !claims.email || claims.email_verified !== true) throw new AuthError('Email not verified');
  return { sub: claims.sub, email: claims.email.toLowerCase() };
}
