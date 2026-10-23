// Renders the icon concepts in branding/icons/ with Playwright's Chromium.
//
//   node branding/render.mjs                 → branding/preview/<name>-<size>.png + sheet.png
//   node branding/render.mjs --ship <name>   → also writes public/icons/icon-{16,32,48,128}.png
//
// The sheet shows every concept at 128, 32 and 16 px on dark and light
// backgrounds: small sizes are where toolbar icons fail.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const iconsDir = path.join(here, 'icons');
const previewDir = path.join(here, 'preview');
const shipDir = path.join(here, '..', 'public', 'icons');
mkdirSync(previewDir, { recursive: true });

const ship = process.argv.includes('--ship') ? process.argv[process.argv.indexOf('--ship') + 1] : null;
const names = readdirSync(iconsDir)
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.slice(0, -4))
  .sort();
if (ship && !names.includes(ship)) throw new Error(`--ship ${ship}: no branding/icons/${ship}.svg`);

const dataUrl = (name) =>
  'data:image/svg+xml;base64,' + Buffer.from(readFileSync(path.join(iconsDir, `${name}.svg`))).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function renderPng(name, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style><img src="${dataUrl(name)}" width="${size}" height="${size}">`,
  );
  await page.locator('img').screenshot({ path: out, omitBackground: true });
}

for (const name of names) {
  for (const size of [16, 32, 48, 128]) await renderPng(name, size, path.join(previewDir, `${name}-${size}.png`));
}
if (ship) {
  for (const size of [16, 32, 48, 128]) await renderPng(ship, size, path.join(shipDir, `icon-${size}.png`));
  console.log(`shipped ${ship} → public/icons/`);
}

// Sheet: rows = concepts; columns = 128/32/16 on dark, then on light. Small
// sizes use the rendered PNGs (not CSS-scaled SVG) so they show real pixels.
const png = (name, size) =>
  'data:image/png;base64,' + readFileSync(path.join(previewDir, `${name}-${size}.png`)).toString('base64');
const cell = (name) =>
  [128, 32, 16].map((s) => `<td><img src="${png(name, s)}" width="${s}" height="${s}" style="image-rendering:pixelated"></td>`).join('');
const rows = names
  .map((n) => `<tr><th>${n}</th><td class="dark"><table><tr>${cell(n)}</tr></table></td><td class="light"><table><tr>${cell(n)}</tr></table></td></tr>`)
  .join('');
await page.setViewportSize({ width: 900, height: 200 });
await page.setContent(`<style>
  body{margin:0;font:14px system-ui;background:#fff}
  table{border-collapse:collapse} th{text-align:left;padding:12px;font-weight:600}
  td{padding:10px;vertical-align:middle} .dark{background:#202124} .light{background:#f1f3f4}
  .dark table td,.light table td{padding:0 14px}
</style><table>${rows}</table>`);
await page.locator('body > table').screenshot({ path: path.join(previewDir, 'sheet.png') });
await browser.close();
console.log(`rendered ${names.length} concepts → branding/preview/`);
