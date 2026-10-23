import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Long titles, an unbroken 140-character URL and a long note must never make
// the page scroll sideways, in the side panel or on the board.

const longTitles = path.resolve(import.meta.dirname, 'data/toby-long-titles.json');

async function importLongTitles(page: Page) {
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(longTitles);
  await page.getByRole('button', { name: 'Import', exact: true }).click(); // returns to the board
  await expect(page.locator('.card')).toHaveCount(4);
}

/** Elements wider than their box or the viewport, described for the failure message. */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll<HTMLElement>('.collection, .card, .open-tabs, .app-main, .space-view')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1) bad.push(`${el.className} right edge ${Math.round(r.right)} > ${vw}`);
      if (el.scrollWidth > el.clientWidth + 1) bad.push(`${el.className} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`);
    }
    return bad;
  });

for (const width of [320, 400]) {
  test(`side panel at ${width}px has no horizontal overflow`, async ({ page, extensionId }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await importLongTitles(page);
    expect(await overflowing(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`sidepanel-${width}.png`) });
    // Chrome's extension-page stylesheet sets body to 75%; card titles must still be 14px.
    expect(await page.locator('.card-title').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('14px');
    // Titles are clamped, not cut to nothing: the full text is in the tooltip.
    const title = page.locator('.card-title').first();
    await expect(title).toHaveAttribute('title', /Anchor Software: Address Validation/);
  });
}

for (const width of [768, 1280]) {
  test(`board at ${width}px has no horizontal overflow`, async ({ page, extensionId }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
    await importLongTitles(page);
    expect(await overflowing(page)).toEqual([]);
  });
}
