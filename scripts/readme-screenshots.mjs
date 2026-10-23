// Screenshots for README.md, made from demo data (docs/demo-data.json), never
// from personal collections.  npm run build && node scripts/readme-screenshots.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'docs', 'images');

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
await page.setViewportSize({ width: 1360, height: 760 });
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
await shoot('board-dark.png', 'dark');
await shoot('board-light.png', 'light');

await page.getByRole('searchbox', { name: 'Search' }).fill('lisbon');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'search.png') });

const panel = await context.newPage();
await panel.setViewportSize({ width: 400, height: 760 });
await panel.goto(`chrome-extension://${id}/src/sidepanel/index.html`);
await panel.locator('.card').first().waitFor();
await panel.waitForTimeout(300);
await panel.screenshot({ path: path.join(out, 'sidepanel.png') });

await context.close();
server.close();
console.log('README screenshots → docs/images/');
