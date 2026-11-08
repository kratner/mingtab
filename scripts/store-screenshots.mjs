// Chrome Web Store screenshots (1280x800, the store's required size), made from
// demo data (docs/demo-data.json), never from personal collections.
//   npm run build && node scripts/store-screenshots.mjs   → docs/store/screenshot-*.png
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'docs', 'store');

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>${decodeURIComponent((req.url ?? '').slice(1))}</title>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}`;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const id = new URL(worker.url()).host;

// An open window with a tab group, so the open-tabs pane has something to show.
await worker.evaluate(async (site) => {
  const names = ['Quarterly plan', 'Design review', 'Hotel shortlist', 'Packing list'];
  const win = await chrome.windows.create({ url: names.map((n) => `${site}/${encodeURIComponent(n)}`), focused: false });
  const tabs = await chrome.tabs.query({ windowId: win.id });
  const gid = await chrome.tabs.group({ tabIds: tabs.slice(2).map((t) => t.id), createProperties: { windowId: win.id } });
  await chrome.tabGroups.update(gid, { title: 'Lisbon trip', color: 'cyan' });
  await new Promise((r) => setTimeout(r, 800));
}, site);

const page = await context.newPage();
// Prompts (the space rename) get "Work"; confirms are accepted.
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Work' : undefined));
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`chrome-extension://${id}/src/newtab/index.html`);
await page.getByRole('button', { name: 'Import from Toby' }).click();
await page.getByLabel('Toby export (.json)').setInputFiles(path.join(root, 'docs', 'demo-data.json'));
await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.locator('.card').first().waitFor();
await page.getByRole('button', { name: 'Rename Imported from Toby' }).click();
await page.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: 'Work', exact: true }).waitFor();
await page.getByRole('button', { name: 'Star October release' }).click();
await page.getByRole('button', { name: 'Tag Lisbon trip' }).click();
await page.getByRole('combobox', { name: 'Add tag to Lisbon trip' }).fill('Travel');
await page.getByRole('combobox', { name: 'Add tag to Lisbon trip' }).press('Enter');
await page.getByRole('button', { name: 'Tag Lisbon trip' }).click();

const shoot = async (name, mode) => {
  await page.evaluate((m) => localStorage.setItem('mingtab.theme', m), mode);
  await page.reload();
  await page.locator('.card').first().waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, name) });
};
await shoot('screenshot-1-board-dark.png', 'dark');
await shoot('screenshot-2-board-light.png', 'light');

await page.getByRole('searchbox', { name: 'Search' }).fill('lisbon');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'screenshot-3-search.png') });

// Select mode: cards picked from two collections, ready to become a new one.
await page.getByRole('searchbox', { name: 'Search' }).fill('');
await page.getByRole('button', { name: 'Select', exact: true }).click();
for (const name of ['Lisbon - Wikipedia', 'Flights to Portugal', 'Customer survey results - Google Sheets']) {
  await page.getByRole('checkbox', { name: `Select ${name}` }).click();
}
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'screenshot-4-select.png') });
await page.getByRole('button', { name: 'Done', exact: true }).click();

await page.getByRole('button', { name: 'Stats' }).first().click();
await page.getByRole('list', { name: 'Totals' }).waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'screenshot-5-stats.png') });
// Back to the space, which the side panel opens on too.
await page.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: 'Work', exact: true }).click();

await context.close();
server.close();
console.log('Store screenshots → docs/store/');
