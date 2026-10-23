// Screenshots the built extension (dist/) in each color scheme and mode, with
// the sample Toby data imported. Output: branding/preview/ui-<scheme>-<mode>.png
//
//   npm run build && node branding/screenshots.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const sample = path.join(root, 'e2e', 'data', 'toby-sample.json');
const out = path.join(root, 'branding', 'preview');

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: 1100, height: 560 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const id = new URL(worker.url()).host;

const page = await context.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(`chrome-extension://${id}/src/newtab/index.html`);
await page.getByRole('button', { name: 'Import from Toby' }).click();
await page.getByLabel('Toby export (.json)').setInputFiles(sample);
await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.locator('.card').first().waitFor();
await page.locator('.collection').first().getByRole('button', { name: /^Star / }).click();

for (const scheme of ['kr', 'terracotta']) {
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
console.log('screenshots → branding/preview/ui-*.png');
