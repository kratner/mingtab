import { createSign } from 'node:crypto';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, launchDevice, test } from './fixtures';

// Two Chromium profiles ("Mac" and "PC") sync through the real Worker running
// locally (global-setup.ts). Sign-in uses an ID token signed by the test key,
// exchanged at the real /v1/auth/google endpoint for a device token.

const syncUrl = () => process.env.E2E_SYNC_URL!;

function testIdToken(sub: string) {
  const jwk = JSON.parse(process.env.E2E_PRIVATE_JWK!) as { kid: string };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' });
  const payload = b64({
    iss: 'https://accounts.google.com',
    aud: '453066917507-acsc56hkjjnrl461cvga9fmkqnlnllp0.apps.googleusercontent.com',
    sub,
    email: 'keith.ratner@gmail.com',
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 600,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const key = { key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' as const };
  return `${header}.${payload}.${signer.sign(key).toString('base64url')}`;
}

async function signInDevice(sw: Worker, sub: string, deviceName: string) {
  const res = await fetch(`${syncUrl()}/v1/auth/google`, {
    method: 'POST',
    body: JSON.stringify({ idToken: testIdToken(sub), deviceName }),
  });
  const { token, email } = (await res.json()) as { token: string; email: string };
  expect(token).toBeTruthy();
  await sw.evaluate(
    (s) => chrome.storage.local.set({ 'mingtab.sync': { token: s.token, email: s.email, cursor: 0, pushMark: 0, lastSyncAt: null, lastError: null, syncing: false } }),
    { token, email },
  );
}

const syncNow = (page: Page) => page.evaluate(() => chrome.runtime.sendMessage({ type: 'mingtab:sync-now' }));
const lastSyncAt = (sw: Worker) =>
  sw.evaluate(async () => ((await chrome.storage.local.get('mingtab.sync'))['mingtab.sync'] as { lastSyncAt: number | null }).lastSyncAt);
const order = (page: Page) =>
  page.locator('section.collection').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

test('two devices stay in sync: create, edit, delete; edits sync on their own; sign-out', async () => {
  test.setTimeout(90_000);
  const sub = `google-${crypto.randomUUID()}`;
  const mac = await launchDevice();
  const pc = await launchDevice();
  const contexts: BrowserContext[] = [mac.context, pc.context];
  try {
    await signInDevice(mac.serviceWorker, sub, 'Mac');
    await signInDevice(pc.serviceWorker, sub, 'PC');
    const a = await mac.context.newPage();
    const b = await pc.context.newPage();
    for (const [p, id] of [[a, mac.extensionId], [b, pc.extensionId]] as const) {
      p.on('dialog', (d) => d.accept());
      await p.goto(`chrome-extension://${id}/src/newtab/index.html`);
    }

    // Mac: create a space, a collection, a card. No explicit sync: the edit
    // itself schedules one (a couple of seconds later).
    const before = await lastSyncAt(mac.serviceWorker);
    await a.getByRole('button', { name: 'Create a space' }).click();
    await a.getByRole('button', { name: '+ Collection' }).click();
    await a.getByRole('textbox', { name: 'Collection title' }).fill('Synced');
    await a.getByRole('textbox', { name: 'Collection title' }).press('Enter');
    await a.getByRole('button', { name: 'Add card to Synced' }).click();
    await a.getByRole('textbox', { name: 'URL' }).fill('example.com/synced');
    await a.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => lastSyncAt(mac.serviceWorker), { timeout: 15_000 }).not.toBe(before);

    // PC: pull, and everything is there.
    await syncNow(b);
    await expect(b.getByRole('region', { name: 'Synced' }).locator('.card')).toHaveCount(1);
    await expect(b.getByRole('navigation', { name: 'Spaces' })).toContainText('My Collections');

    // PC renames; Mac sees it.
    await b.getByRole('button', { name: /^Collection title: Synced/ }).click();
    await b.getByRole('textbox', { name: 'Collection title' }).fill('Synced and renamed');
    await b.getByRole('textbox', { name: 'Collection title' }).press('Enter');
    await syncNow(b);
    await syncNow(a);
    await expect.poll(() => order(a)).toEqual(['Synced and renamed']);

    // Mac queues the card in Next; PC's Next has it.
    await a.locator('.card').first().hover();
    await a.getByRole('button', { name: /^Add .* to Next$/ }).click();
    await syncNow(a);
    await syncNow(b);
    await expect(b.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: /▶ Next/ })).toContainText('1');

    // Mac deletes the collection; PC loses it too.
    await a.getByRole('button', { name: 'Delete Synced and renamed' }).click();
    await syncNow(a);
    await syncNow(b);
    await expect.poll(() => order(b)).toEqual([]);

    // Settings shows who's signed in; signing out stops sync but keeps data.
    await b.getByRole('button', { name: 'Settings' }).click();
    await expect(b.getByRole('status', { name: 'Sync status' })).toContainText('Signed in as keith.ratner@gmail.com');
    await b.getByRole('button', { name: 'Sign out' }).click();
    await expect(b.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('a device signed in later gets everything, and its own local data is merged in', async () => {
  test.setTimeout(60_000);
  const sub = `google-${crypto.randomUUID()}`;
  const mac = await launchDevice();
  const pc = await launchDevice();
  try {
    const a = await mac.context.newPage();
    const b = await pc.context.newPage();
    for (const [p, id] of [[a, mac.extensionId], [b, pc.extensionId]] as const) {
      p.on('dialog', (d) => d.accept());
      await p.goto(`chrome-extension://${id}/src/newtab/index.html`);
      await p.getByRole('button', { name: 'Create a space' }).click();
      await p.getByRole('button', { name: '+ Collection' }).click();
    }
    for (const [p, title] of [[a, 'From Mac'], [b, 'From PC']] as const) {
      await p.getByRole('textbox', { name: 'Collection title' }).fill(title);
      await p.getByRole('textbox', { name: 'Collection title' }).press('Enter');
    }
    // Both had data before signing in; after both sync, both have both.
    await signInDevice(mac.serviceWorker, sub, 'Mac');
    await syncNow(a);
    await signInDevice(pc.serviceWorker, sub, 'PC');
    await syncNow(b);
    await syncNow(a);
    const all = async (p: Page) => {
      const out: string[] = [];
      const links = p.getByRole('navigation', { name: 'Spaces' }).locator('ul .space-link');
      for (let i = 0; i < (await links.count()); i++) {
        await links.nth(i).click();
        await p.waitForTimeout(150);
        out.push(...((await order(p)) as string[]));
      }
      return out.sort();
    };
    await expect.poll(() => all(a)).toEqual(['From Mac', 'From PC']);
    await expect.poll(() => all(b)).toEqual(['From Mac', 'From PC']);
  } finally {
    await Promise.all([mac.context.close(), pc.context.close()]);
  }
});
