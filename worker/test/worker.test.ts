import { describe, expect, it } from 'vitest';
import { api, card, idToken, signIn, syncAs } from './helpers';

describe('sign-in', () => {
  it('accepts a valid Google token for an allowed email and returns a device token', async () => {
    const { res, body } = await signIn();
    expect(res.status).toBe(200);
    expect(body.email).toBe('keith.ratner@gmail.com');
    expect(body.token).toMatch(/^[\w-]{40,}$/);
    const me = await api('/v1/me', { headers: { authorization: `Bearer ${body.token}` } });
    expect(await me.json()).toEqual({ email: 'keith.ratner@gmail.com' });
  });

  it('rejects other Google accounts', async () => {
    const { res, body } = await signIn({ email: 'someone@example.com', sub: 'other' });
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/not allowed/);
  });

  it('rejects expired, wrong-audience, unverified and tampered tokens', async () => {
    for (const claims of [
      { exp: Math.floor(Date.now() / 1000) - 3600 },
      { aud: 'another-app.apps.googleusercontent.com' },
      { email_verified: false },
      { iss: 'https://evil.example' },
    ]) {
      expect((await signIn(claims)).res.status).toBe(401);
    }
    const good = await idToken();
    const [h, p, s] = good.split('.');
    const forged = `${h}.${p!.slice(0, -4)}AAAA.${s}`;
    const res = await api('/v1/auth/google', { method: 'POST', body: JSON.stringify({ idToken: forged }) });
    expect(res.status).toBe(401);
    for (const junk of ['a.b.c', 'not-a-jwt', '!!!.@@@.###']) {
      const r = await api('/v1/auth/google', { method: 'POST', body: JSON.stringify({ idToken: junk }) });
      expect(r.status).toBe(401);
    }
  });

  it('requires a device token for everything else; sign-out revokes it', async () => {
    expect((await api('/v1/sync', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await api('/v1/me', { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    const { body } = await signIn();
    await api('/v1/auth/signout', { method: 'POST', headers: { authorization: `Bearer ${body.token}` } });
    expect((await api('/v1/me', { headers: { authorization: `Bearer ${body.token}` } })).status).toBe(401);
  });
});

describe('sync', () => {
  it('two devices: what one pushes, the other pulls', async () => {
    const sub = 'same-google-account';
    const a = (await signIn({ sub }, 'Mac')).body.token!;
    const b = (await signIn({ sub }, 'PC')).body.token!;
    const pushed = await syncAs(a, 0, [card('k1', 'One', 100), card('k2', 'Two', 100)]);
    expect(pushed.body.changes.map((c) => c.id)).toEqual(['k1', 'k2']);
    const pulled = await syncAs(b, 0);
    expect(pulled.body.changes.map((c) => c.data.title)).toEqual(['One', 'Two']);
    expect(pulled.body.cursor).toBe(pushed.body.cursor);
    // Nothing new since the cursor.
    expect((await syncAs(b, pulled.body.cursor)).body.changes).toEqual([]);
  });

  it('last writer wins by updatedAt; older and equal writes are ignored', async () => {
    const t = (await signIn()).body.token!;
    await syncAs(t, 0, [card('k1', 'v2', 200)]);
    const after = (await syncAs(t, 0)).body.cursor;
    await syncAs(t, after, [card('k1', 'stale', 100), card('k1', 'same-time', 200)]);
    const all = await syncAs(t, 0);
    expect(all.body.changes.map((c) => c.data.title)).toEqual(['v2']);
    expect(all.body.cursor).toBe(after); // ignored writes don't bump the cursor
    await syncAs(t, after, [card('k1', 'v3', 300)]);
    expect((await syncAs(t, after)).body.changes.map((c) => c.data.title)).toEqual(['v3']);
  });

  it('deletions sync as tombstones', async () => {
    const t = (await signIn()).body.token!;
    await syncAs(t, 0, [card('k1', 'x', 100)]);
    const c = (await syncAs(t, 0)).body.cursor;
    await syncAs(t, c, [card('k1', 'x', 200, 200)]);
    const res = (await syncAs(t, c)).body.changes as unknown as { deletedAt: number }[];
    expect(res[0]!.deletedAt).toBe(200);
  });

  it("users never see each other's records", async () => {
    // Two different Google accounts (both on the allow list by email, different account ids).
    const mine = (await signIn()).body.token!;
    const other = (await signIn()).body.token!;
    await syncAs(mine, 0, [card('k1', 'mine', 100)]);
    expect((await syncAs(other, 0)).body.changes).toEqual([]);
  });

  it('pages large pulls', async () => {
    const t = (await signIn()).body.token!;
    for (let i = 0; i < 13; i++) {
      await syncAs(t, 0, Array.from({ length: 40 }, (_, j) => card(`k${i}-${j}`, 't', 100)));
    }
    const first = await syncAs(t, 0);
    expect(first.body.changes).toHaveLength(500);
    expect(first.body.hasMore).toBe(true);
    const second = await syncAs(t, first.body.cursor);
    expect(second.body.changes).toHaveLength(20);
    expect(second.body.hasMore).toBe(false);
  });

  it('rejects malformed and oversized pushes', async () => {
    const t = (await signIn()).body.token!;
    expect((await syncAs(t, 0, [{ table: 'secrets', id: 'x', updatedAt: 1, data: { id: 'x' } }])).res.status).toBe(400);
    expect((await syncAs(t, 0, [{ ...card('k1', 'x', 1), data: { id: 'different' } }])).res.status).toBe(400);
    expect((await syncAs(t, 0, Array.from({ length: 41 }, (_, i) => card(`k${i}`, 'x', 1)))).res.status).toBe(400);
  });
});

describe('CORS', () => {
  it('answers preflight for the extension origin only', async () => {
    const ok = await api('/v1/sync', { method: 'OPTIONS', headers: { origin: 'chrome-extension://jclkedgbnlmbonoihhobgnmdoehmddpo' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('chrome-extension://jclkedgbnlmbonoihhobgnmdoehmddpo');
    const no = await api('/v1/sync', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
  });
});
