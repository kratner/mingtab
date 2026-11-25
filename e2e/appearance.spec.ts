import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Settings → Appearance: the text-size slider scales every font size, and
// "Square corners" removes the rounding from panels, cards and buttons.
// Both are remembered per device.

const longTitles = path.resolve(import.meta.dirname, 'data/toby-long-titles.json');

const fontSize = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize);
const radius = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);

test('text size slider and square corners', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(longTitles);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(4);

  // Defaults: 90% text, rounded corners.
  expect(await fontSize(page, '.card-title')).toBe('12.6px');
  expect(await radius(page, '.collection')).not.toBe('0px');

  await page.getByRole('button', { name: 'Settings' }).click();
  const slider = page.getByLabel('Text size');
  await expect(slider).toHaveValue('90');
  await expect(page.getByRole('button', { name: 'Reset' })).toBeDisabled();
  await slider.fill('120');
  await expect(page.locator('.text-size-value')).toHaveText('120%');
  await page.getByLabel('Square corners').check();
  await page.screenshot({ path: test.info().outputPath('settings-appearance.png') });
  await page.getByRole('button', { name: 'Back to board' }).click();

  expect(await fontSize(page, '.card-title')).toBe('16.8px');
  expect(await radius(page, '.collection')).toBe('0px');
  expect(await radius(page, '.app-header button')).toBe('0px');
  await page.screenshot({ path: test.info().outputPath('board-120-square.png') });

  // Remembered after a reload, and applied before React renders.
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--text-scale'))).toBe('1.2');
  await expect(page.locator('.card')).toHaveCount(4);
  expect(await fontSize(page, '.card-title')).toBe('16.8px');
  expect(await radius(page, '.collection')).toBe('0px');

  // Reset goes back to the default; rounded corners come back.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByLabel('Text size')).toHaveValue('90');
  await page.getByLabel('Rounded corners').check();
  await page.getByRole('button', { name: 'Back to board' }).click();
  expect(await fontSize(page, '.card-title')).toBe('12.6px');
  expect(await radius(page, '.collection')).not.toBe('0px');
});

test('text size reaches the side panel', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  await page.evaluate(() => localStorage.setItem('mingtab.textSize', '75'));
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('10.5px');
});

test('largest text size in a 320px side panel has no horizontal overflow', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await page.evaluate(() => localStorage.setItem('mingtab.textSize', '130'));
  page.on('dialog', (d) => d.accept());
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(longTitles);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: test.info().outputPath('sidepanel-320-130.png') });
});
