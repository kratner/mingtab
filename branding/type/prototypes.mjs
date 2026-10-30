// Font styling prototypes for MingTab: the real built extension (dist/) on the README demo
// data, with each option's CSS laid over app.css. Nothing here ships; pick one, then move its
// rules into src/app/app.css.
//
//   npm run build && node branding/type/prototypes.mjs   → branding/type/shots/<option>-<view>.png
//
// Candidate fonts outside the Four Ounces kit load from Google Fonts for this preview only.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'dist');
const out = path.join(import.meta.dirname, 'shots');
mkdirSync(out, { recursive: true });

const gf = (q) => `@import url('https://fonts.googleapis.com/css2?${q}&display=block');`;
export const OPTIONS = [
  { id: 'a-current', css: '' },
  {
    id: 'b-brand-headlines',
    css: `
.space-toolbar h2 { font-family: var(--fo-font-display) !important; font-weight: 400 !important; font-size: 20px !important; text-transform: uppercase; letter-spacing: .02em; }
.collection-title { font-family: var(--fo-font-display) !important; font-weight: 400 !important; text-transform: uppercase; letter-spacing: .01em; font-size: 11.5px; }
.sidebar-head, .pane-title { font-family: var(--fo-font-display) !important; font-weight: 400 !important; letter-spacing: .08em !important; }`,
  },
  {
    id: 'c-archivo',
    css: `${gf('family=Archivo:wght@400;500;600;700')}
:root, body { font-family: 'Archivo', var(--fo-font-text) !important; }
.space-toolbar h2 { font-family: var(--fo-font-display) !important; font-weight: 400 !important; font-size: 19px !important; }
.collection-title { font-weight: 700 !important; letter-spacing: -.005em; }
.card-title { font-weight: 500; }`,
  },
  {
    id: 'd-fraunces',
    css: `${gf('family=Fraunces:opsz,wght@9..144,500;9..144,600')}
.space-toolbar h2 { font-family: 'Fraunces', serif !important; font-weight: 600 !important; font-size: 24px !important; letter-spacing: -.01em; }
.collection-title { font-family: 'Fraunces', serif !important; font-weight: 600 !important; font-size: 15px; letter-spacing: -.01em; }
.space-link { font-family: 'Fraunces', serif; font-size: 15px; }`,
  },
  {
    id: 'e-instrument-serif',
    css: `${gf('family=Instrument+Serif:ital@0;1')}
.space-toolbar h2 { font-family: 'Instrument Serif', serif !important; font-weight: 400 !important; font-size: 30px !important; line-height: 1 !important; }
.collection-title { font-family: 'Instrument Serif', serif !important; font-weight: 400 !important; font-size: 20px; line-height: 1.1; }
.window-title, .pane-title { font-family: 'Instrument Serif', serif !important; font-weight: 400 !important; font-size: 18px !important; text-transform: none !important; letter-spacing: 0 !important; }`,
  },
  {
    id: 'f-mono-details',
    css: `
.card-host, .count, .sidebar-head, .surface-tag, .pane-title, .card-actions + *, .tag-chip { font-family: var(--fo-font-mono) !important; }
.card-host { font-size: 11.5px !important; letter-spacing: -.01em; }
.count, .surface-tag { font-size: 11.5px !important; }
.sidebar-head, .pane-title { font-size: 11px !important; letter-spacing: .06em !important; }
.collection-title { font-weight: 600; letter-spacing: -.01em; }
.space-toolbar h2 { font-weight: 700 !important; letter-spacing: -.015em; font-size: 19px !important; }`,
  },
];

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>${decodeURIComponent((req.url ?? '').slice(1))}</title>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}`;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  deviceScaleFactor: 2, // sharp on Retina screens
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const id = new URL(worker.url()).host;
await worker.evaluate(async (site) => {
  const names = ['Quarterly plan', 'Design review', 'Hotel shortlist', 'Packing list'];
  const win = await chrome.windows.create({ url: names.map((n) => `${site}/${encodeURIComponent(n)}`), focused: false });
  const tabs = await chrome.tabs.query({ windowId: win.id });
  const gid = await chrome.tabs.group({ tabIds: tabs.slice(2).map((t) => t.id), createProperties: { windowId: win.id } });
  await chrome.tabGroups.update(gid, { title: 'Lisbon trip', color: 'cyan' });
  await new Promise((r) => setTimeout(r, 800));
}, site);

const page = await context.newPage();
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

const panel = await context.newPage();
await panel.setViewportSize({ width: 400, height: 760 });

async function styled(p, url, css, mode) {
  await p.evaluate((m) => localStorage.setItem('mingtab.theme', m), mode).catch(() => {});
  await p.goto(url);
  await p.evaluate((m) => localStorage.setItem('mingtab.theme', m), mode);
  await p.reload();
  await p.locator('.card').first().waitFor();
  if (css) await p.addStyleTag({ content: css });
  await p.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 400));
  });
}
const board = `chrome-extension://${id}/src/newtab/index.html`;
const side = `chrome-extension://${id}/src/sidepanel/index.html`;
for (const o of OPTIONS) {
  for (const mode of ['dark', 'light']) {
    await styled(page, board, o.css, mode);
    await page.screenshot({ path: path.join(out, `${o.id}-board-${mode}.png`) });
  }
  await styled(panel, side, o.css, 'light');
  await panel.screenshot({ path: path.join(out, `${o.id}-panel-light.png`) });
  console.log('shot', o.id);
}
await context.close();
server.close();
