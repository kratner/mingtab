// Screenshots the built extension (dist/) in each color scheme and mode, with
// the sample Toby data imported. Output: branding/preview/ui-<scheme>-<mode>.png
//
//   npm run build && node branding/screenshots.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const sample = path.join(root, 'e2e', 'data', 'toby-sample.json');
const out = path.join(root, 'branding', 'preview');

// Local pages so the open-tabs pane has something to show.
const server = createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '').slice(1));
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>${name}</title>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}`;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: 1100, height: 560 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const id = new URL(worker.url()).host;

await worker.evaluate(async (site) => {
  const names = ['Quarterly plan', 'Design review', 'Flight options', 'Hotel shortlist', 'Packing list'];
  const win = await chrome.windows.create({ url: names.map((n) => `${site}/${encodeURIComponent(n)}`), focused: false });
  const tabs = await chrome.tabs.query({ windowId: win.id });
  const gid = await chrome.tabs.group({ tabIds: tabs.slice(2).map((t) => t.id), createProperties: { windowId: win.id } });
  await chrome.tabGroups.update(gid, { title: 'Lisbon trip', color: 'cyan' });
  await new Promise((r) => setTimeout(r, 800));
}, site);

const page = await context.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(`chrome-extension://${id}/src/newtab/index.html`);
await page.getByRole('button', { name: 'Import from Toby' }).click();
await page.getByLabel('Toby export (.json)').setInputFiles(sample);
await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.locator('.card').first().waitFor();
await page.locator('.collection').first().getByRole('button', { name: /^Star / }).click();

for (const scheme of ['four-ounces', 'terracotta']) {
  for (const mode of ['dark', 'light']) {
    await page.evaluate(([s, m]) => {
      localStorage.setItem('mingtab.scheme', s);
      localStorage.setItem('mingtab.theme', m);
    }, [scheme, mode]);
    await page.reload();
    await page.locator('.card').first().waitFor();
    await page.locator('.card').nth(1).hover();
    await page.screenshot({ path: path.join(out, `ui-${scheme}-${mode}.png`) });
  }
}
await context.close();
server.close();
console.log('screenshots → branding/preview/ui-*.png');
