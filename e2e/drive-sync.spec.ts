import type { BrowserContext, Page, Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { FakeDrive } from '../src/sync/drive/fake';
import { expect, launchDevice, test } from './fixtures';
import { DRIVE_PORT } from './global-setup';

// Google Drive sync, end to end through Settings. dist-test/ talks to a fake
// Google (Drive API + OAuth endpoint) on DRIVE_PORT; the real
// chrome.identity.launchWebAuthFlow runs against it, so the sign-in clicks,
// the redirect, silent renewal and Reconnect are all exercised.

test.describe.configure({ mode: 'serial' });

const fake = new FakeDrive({ baseUrl: `http://127.0.0.1:${DRIVE_PORT}` });
let server: Server;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const out = await fake.handle(
      new Request(`http://127.0.0.1:${DRIVE_PORT}${req.url}`, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      }),
    );
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(DRIVE_PORT, '127.0.0.1', r));
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

const syncNow = (page: Page) => page.evaluate(() => chrome.runtime.sendMessage({ type: 'mingtab:sync-now' }));
const order = (page: Page) =>
  page.locator('section.collection').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const syncState = (sw: Worker) =>
  sw.evaluate(async () => (await chrome.storage.local.get('mingtab.sync'))['mingtab.sync'] as Record<string, unknown>);

async function openBoard(device: Awaited<ReturnType<typeof launchDevice>>) {
  const page = await device.context.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(`chrome-extension://${device.extensionId}/src/newtab/index.html`);
  return page;
}

async function turnOnDrive(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sync with Google Drive' }).click();
  await expect(page.getByRole('status', { name: 'Sync status' })).toContainText(
    `Syncing with Google Drive as ${fake.email}`,
  );
  await expect(page.getByRole('status', { name: 'Sync status' })).toContainText('Last synced just now', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Back to board' }).click();
}

test('Drive sync from Settings: two devices, rename, reconnect, delete synced data', async () => {
  test.setTimeout(120_000);
  const mac = await launchDevice();
  const pc = await launchDevice();
  const contexts: BrowserContext[] = [mac.context, pc.context];
  try {
    const a = await openBoard(mac);
    const b = await openBoard(pc);

    // Signed out, Settings offers Drive first and the invite-only server tucked away.
    await a.getByRole('button', { name: 'Settings' }).click();
    await expect(a.getByRole('button', { name: 'Sync with Google Drive' })).toBeVisible();
    await expect(a.getByRole('button', { name: 'Sign in to the MingTab sync server' })).toBeHidden();
    await a.getByText('Other ways to sync').click();
    await expect(a.getByRole('button', { name: 'Sign in to the MingTab sync server' })).toBeVisible();
    await a.getByRole('button', { name: 'Back to board' }).click();

    // Mac has a collection before turning sync on; it goes up.
    await a.getByRole('button', { name: 'Create a space' }).click();
    await a.getByRole('button', { name: '+ Collection' }).click();
    await a.getByRole('textbox', { name: 'Collection title' }).fill('On Drive');
    await a.getByRole('textbox', { name: 'Collection title' }).press('Enter');
    await turnOnDrive(a);
    expect(fake.filesOf()).toHaveLength(1);
    expect(fake.filesOf()[0]!.content).toContain('On Drive');
    const macState = await syncState(mac.serviceWorker);
    expect(macState).toMatchObject({ backend: 'drive', email: fake.email });

    // PC turns it on and gets the collection.
    await turnOnDrive(b);
    await expect.poll(() => order(b)).toEqual(['On Drive']);
    expect(fake.filesOf()).toHaveLength(2);

    // PC renames; Mac sees it.
    await b.getByRole('button', { name: /^Collection title: On Drive/ }).click();
    await b.getByRole('textbox', { name: 'Collection title' }).fill('Renamed on PC');
    await b.getByRole('textbox', { name: 'Collection title' }).press('Enter');
    await syncNow(b);
    await syncNow(a);
    await expect.poll(() => order(a)).toEqual(['Renamed on PC']);

    // Tokens expire and silent renewal still works: sync carries on unnoticed.
    fake.expireAllTokens();
    await syncNow(a);
    expect((await syncState(mac.serviceWorker)).lastError).toBeNull();

    // Silent renewal refused (signed out of Google, say): Settings asks to reconnect.
    fake.expireAllTokens();
    fake.denySilent = true;
    await syncNow(a);
    await a.getByRole('button', { name: 'Settings' }).click();
    await expect(a.getByRole('alert')).toContainText('lost access to Google Drive');
    await a.getByRole('button', { name: 'Reconnect Google Drive' }).click();
    await expect(a.getByRole('button', { name: 'Sync now' })).toBeVisible();
    await expect(a.getByRole('alert')).toHaveCount(0);
    fake.denySilent = false;
    expect(await syncNow(a)).toBe(true);
    expect((await syncState(mac.serviceWorker)).lastError).toBeNull();

    // PC deletes the synced data: Drive's app folder empties, PC turns off.
    await b.getByRole('button', { name: 'Settings' }).click();
    await b.getByRole('button', { name: 'Delete synced data' }).click();
    await expect(b.getByText('Your synced data was deleted from Google Drive')).toBeVisible();
    await expect(b.getByRole('button', { name: 'Sync with Google Drive' })).toBeVisible();
    expect(fake.filesOf()).toHaveLength(0);

    // Mac notices on its next sync and stops, instead of uploading everything again. Its collections stay.
    await syncNow(a);
    await expect(a.getByRole('button', { name: 'Sync with Google Drive' })).toBeVisible();
    await expect(a.getByRole('alert')).toContainText('deleted from Google Drive');
    expect(fake.filesOf()).toHaveLength(0);
    await a.getByRole('button', { name: 'Back to board' }).click();
    await expect.poll(() => order(a)).toEqual(['Renamed on PC']);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('Drive sync: unticking the Drive permission is explained, and sign-out keeps data', async () => {
  test.setTimeout(60_000);
  const dev = await launchDevice();
  try {
    const p = await openBoard(dev);
    await p.getByRole('button', { name: 'Settings' }).click();
    fake.grantDrive = false;
    await p.getByRole('button', { name: 'Sync with Google Drive' }).click();
    await expect(p.getByRole('alert')).toContainText('hidden folder in your Google Drive');
    fake.grantDrive = true;

    await p.getByRole('button', { name: 'Sync with Google Drive' }).click();
    await expect(p.getByRole('status', { name: 'Sync status' })).toContainText('Syncing with Google Drive');
    await p.getByRole('button', { name: 'Sign out' }).click();
    await expect(p.getByRole('button', { name: 'Sync with Google Drive' })).toBeVisible();
    expect(await syncState(dev.serviceWorker)).toMatchObject({ backend: null, email: null });
    const token = await dev.serviceWorker.evaluate(() => chrome.storage.session.get('mingtab.driveToken'));
    expect(token).toEqual({});
  } finally {
    await dev.context.close();
  }
});
