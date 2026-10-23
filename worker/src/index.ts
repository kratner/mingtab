import { AuthError, googleKeys, verifyGoogleIdToken, type JwkSet, type KeySource } from './google';
import { BadRequest, sync, validate } from './sync';

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  /** Comma-separated; only these Google accounts may sign in. */
  ALLOWED_EMAILS: string;
  /** Comma-separated origins allowed by CORS (the extension, later the web app). */
  ALLOWED_ORIGINS: string;
  /** Tests only: a JWK set used instead of Google's real keys. Never set in production. */
  TEST_JWKS?: string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  if (!allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

async function userFromToken(req: Request, env: Env): Promise<{ userId: string; email: string; tokenHash: string } | null> {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  const tokenHash = await sha256(m[1]!);
  const row = await env.DB.prepare(
    `SELECT s.user_id AS userId, u.email AS email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ userId: string; email: string }>();
  if (!row) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(Date.now(), tokenHash).run();
  return { ...row, tokenHash };
}

async function signInWithGoogle(req: Request, env: Env) {
  const body = (await req.json().catch(() => null)) as { idToken?: string; deviceName?: string } | null;
  if (!body?.idToken) return json({ error: 'idToken required' }, 400);
  const keys: KeySource = env.TEST_JWKS ? async () => JSON.parse(env.TEST_JWKS!) as JwkSet : googleKeys;
  const who = await verifyGoogleIdToken(body.idToken, env.GOOGLE_CLIENT_ID, keys);
  const allowed = env.ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase());
  if (!allowed.includes(who.email)) return json({ error: `${who.email} is not allowed to use this MingTab sync service.` }, 403);

  const now = Date.now();
  let user = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(who.sub).first<{ id: string }>();
  if (!user) {
    user = { id: crypto.randomUUID() };
    await env.DB.prepare('INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)')
      .bind(user.id, who.sub, who.email, now)
      .run();
  }
  const token = newToken();
  const deviceName = (body.deviceName ?? 'Unknown device').slice(0, 100);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, device_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), user.id, deviceName, now, now)
    .run();
  return json({ token, email: who.email });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (url.pathname === '/' && req.method === 'GET') return new Response('MingTab sync\n', { headers });
      if (url.pathname === '/v1/auth/google' && req.method === 'POST') {
        const res = await signInWithGoogle(req, env);
        Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }

      const me = await userFromToken(req, env);
      if (!me) return json({ error: 'Not signed in' }, 401, headers);

      if (url.pathname === '/v1/me' && req.method === 'GET') return json({ email: me.email }, 200, headers);
      if (url.pathname === '/v1/auth/signout' && req.method === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(me.tokenHash).run();
        return json({ ok: true }, 200, headers);
      }
      if (url.pathname === '/v1/sync' && req.method === 'POST') {
        const body = validate(await req.json().catch(() => null));
        return json(await sync(env.DB, me.userId, body), 200, headers);
      }
      return json({ error: 'Not found' }, 404, headers);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message }, 401, headers);
      if (e instanceof BadRequest) return json({ error: e.message }, 400, headers);
      console.error(e);
      return json({ error: 'Server error' }, 500, headers);
    }
  },
} satisfies ExportedHandler<Env>;
