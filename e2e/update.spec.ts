import { chromium } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { distDir, expect, launchOptions, test } from './fixtures';
import { UPDATE_PORT } from './global-setup';

// dist-test/ checks a fake GitHub on UPDATE_PORT (see global-setup.ts). One
// server for the file, so the tests run one after another.
test.describe.configure({ mode: 'serial' });

let reply: { status: number; body: unknown } = { status: 404, body: { message: 'Not Found' } };
const release = (version: string) => ({
  status: 200,
  body: {
    tag_name: `v${version}`,
    html_url: `https://github.com/kratner/mingtab/releases/tag/v${version}`,
    assets: [{ name: `mingtab-${version}.zip`, browser_download_url: `https://example.invalid/mingtab-${version}.zip` }],
  },
});

let server: Server;
test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(reply.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((r) => server.listen(UPDATE_PORT, '127.0.0.1', r));
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

const board = (extensionId: string) => `chrome-extension://${extensionId}/src/newtab/index.html`;

test('a newer release: banner with download, badge on the toolbar button, skip quiets both', async ({
  page,
  extensionId,
  serviceWorker: sw,
}) => {
  reply = release('99.0.0');
  await page.goto(board(extensionId));
  // The install-time check runs in the background; Settings → Check now doesn't wait for it.
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({})), { timeout: 10_000 }).toBe('↑');

  const banner = page.getByRole('status', { name: 'Update' });
  await expect(banner).toContainText('MingTab 99.0.0 is available.');
  await expect(banner.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'https://example.invalid/mingtab-99.0.0.zip');
  await expect(banner.getByRole('link', { name: "What's new" })).toHaveAttribute(
    'href',
    'https://github.com/kratner/mingtab/releases/tag/v99.0.0',
  );

  await banner.getByRole('button', { name: 'Skip this version' }).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  await page.reload();
  await expect(page.getByRole('status', { name: 'Update' })).toHaveCount(0);
});

test('Settings: check now, up to date, and a failed check', async ({ page, extensionId }) => {
  page.on('dialog', (d) => d.accept());
  reply = { status: 404, body: { message: 'Not Found' } };
  await page.goto(board(extensionId));
  await page.getByRole('button', { name: 'Create a space' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const updates = page.getByRole('region', { name: 'Updates' });

  await updates.getByRole('button', { name: 'Check now' }).click();
  await expect(updates).toContainText("Couldn't check for updates: No public release found.");
  await expect(page.getByRole('status', { name: 'Update' })).toHaveCount(0);

  const running = await page.evaluate(() => chrome.runtime.getManifest().version);
  reply = release(running);
  await updates.getByRole('button', { name: 'Check now' }).click();
  await expect(updates).toContainText('This is the latest version.');

  reply = release('99.1.0');
  await updates.getByRole('button', { name: 'Check now' }).click();
  await expect(updates).toContainText('MingTab 99.1.0 is available.');
  await expect(page.getByRole('status', { name: 'Update' })).toContainText('MingTab 99.1.0 is available.');

  await updates.getByRole('checkbox', { name: 'Check for updates once a day' }).uncheck();
  expect(await page.evaluate(() => chrome.storage.local.get('mingtab.update.auto'))).toEqual({ 'mingtab.update.auto': false });
});

test('newer files unzipped over the folder: MingTab offers a restart', async () => {
  // A copy of the build, so changing its manifest doesn't touch dist-test/.
  const dir = mkdtempSync(path.join(tmpdir(), 'mingtab-update-'));
  cpSync(distDir, dir, { recursive: true });
  reply = { status: 404, body: { message: 'Not Found' } };
  const context = await chromium.launchPersistentContext('', {
    ...launchOptions(),
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto(board(new URL(sw.url()).host));
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Update' })).toHaveCount(0);

    // What unzipping a new release over the folder does.
    const manifest = path.join(dir, 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ ...JSON.parse(readFileSync(manifest, 'utf8')), version: '99.2.0' }));

    await page.reload();
    const banner = page.getByRole('status', { name: 'Update' });
    await expect(banner).toContainText('MingTab 99.2.0 is ready.');
    await expect(banner.getByRole('button', { name: 'Restart MingTab' })).toBeVisible();
    // The badge follows on the background's next tick; run it now rather than wait a minute.
    await expect
      .poll(async () => {
        await sw.evaluate(() => chrome.storage.local.set({ 'mingtab.update.skipped': `poke-${Date.now()}` }));
        return sw.evaluate(() => chrome.action.getBadgeText({}));
      })
      .toBe('↑');
    // Clicking Restart calls chrome.runtime.reload(), which Playwright's command-line-loaded
    // extensions don't come back from; checked by hand in Chrome instead.
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
