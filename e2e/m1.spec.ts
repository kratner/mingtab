import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const importsDir = path.resolve(import.meta.dirname, '../imports');
const realExport = existsSync(importsDir)
  ? readdirSync(importsDir).find((f) => /^toby-export.*\.json$/.test(f))
  : undefined;
const realMap = path.join(importsDir, 'toby-space-map.json');
const sampleExport = path.resolve(import.meta.dirname, 'data/toby-sample.json');

const board = (page: Page, extensionId: string) =>
  page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);

/** Rendered cards, summed over every space. Waits for each space's count to settle. */
async function totalCardsAcrossSpaces(page: Page) {
  const links = page.getByRole('navigation', { name: 'Spaces' }).locator('.space-link');
  let total = 0;
  for (let i = 0; i < (await links.count()); i++) {
    await links.nth(i).click();
    await expect(page.locator('.space-link.active')).toHaveText((await links.nth(i).textContent())!);
    let prev = -1;
    let n = await page.locator('.card').count();
    while (n !== prev) {
      await page.waitForTimeout(150);
      prev = n;
      n = await page.locator('.card').count();
    }
    total += n;
  }
  return total;
}

/** Live (non-deleted) cards straight from IndexedDB. */
const liveCardsInDb = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('mingtab');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const all = req.result.transaction('cards').objectStore('cards').getAll();
          all.onsuccess = () => resolve(all.result.filter((c: { deletedAt: number | null }) => c.deletedAt === null).length);
          all.onerror = () => reject(all.error);
        };
      }),
  );

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
});

test('create, edit and delete a space, collection and card; edits persist', async ({ page, extensionId }) => {
  await board(page, extensionId);
  await page.getByRole('button', { name: 'Create a space' }).click();
  await expect(page.getByRole('navigation', { name: 'Spaces' })).toContainText('My Collections');

  await page.getByRole('button', { name: '+ Collection' }).click();
  const titleInput = page.getByRole('textbox', { name: 'Collection title' });
  await titleInput.fill('Reading');
  await titleInput.press('Enter');
  await expect(page.getByRole('region', { name: 'Reading' })).toBeVisible();

  await page.getByRole('button', { name: 'Add card to Reading' }).click();
  await page.getByRole('textbox', { name: 'URL' }).fill('example.com/article');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const card = page.locator('.card').first();
  await expect(card.locator('a.card-title')).toHaveAttribute('href', 'https://example.com/article');

  await card.hover();
  await card.getByRole('button', { name: /^Edit / }).click();
  await card.getByLabel('Title').fill('Great article');
  await card.getByLabel('Note').fill('read on the weekend');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card).toContainText('Great article');
  await expect(card).toContainText('read on the weekend');

  await page.reload();
  await expect(page.locator('.card').first()).toContainText('Great article');
  await expect(page.locator('.card').first()).toContainText('read on the weekend');

  await page.locator('.card').first().hover();
  await page.getByRole('button', { name: 'Delete Great article' }).click();
  await expect(page.locator('.card')).toHaveCount(0);

  await page.getByRole('button', { name: 'Star Reading' }).click();
  await expect(page.getByRole('button', { name: 'Unstar Reading' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unstar Reading' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Reading' }).click();
  await expect(page.getByRole('region', { name: 'Reading' })).toHaveCount(0);
});

test('side panel and board show the same data', async ({ context, page, extensionId }) => {
  await board(page, extensionId);
  await page.getByRole('button', { name: 'Create a space' }).click();
  await page.getByRole('button', { name: '+ Collection' }).click();
  await page.getByRole('textbox', { name: 'Collection title' }).fill('Shared');
  await page.getByRole('textbox', { name: 'Collection title' }).press('Enter');

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await expect(panel.getByRole('combobox', { name: 'Space' })).toHaveValue(/.+/);
  await expect(panel.getByRole('region', { name: 'Shared' })).toBeVisible();
});

test('Toby import (sample, no space map) lands in one space', async ({ page, extensionId }) => {
  await board(page, extensionId);
  await page.getByRole('button', { name: 'Import from Toby' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(sampleExport);
  await expect(page.getByTestId('in-collections')).toHaveText('3');
  await expect(page.getByTestId('out-collections')).toHaveText('2'); // empty one skipped by default
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Spaces' })).toContainText('Imported from Toby');
  await expect(page.locator('.card')).toHaveCount(3);
});

test.describe(() => {
  test.skip(!realExport || !existsSync(realMap), 'needs imports/toby-export*.json and imports/toby-space-map.json');

  test("Keith's real Toby export imports every card; backup round-trips", async ({ page, extensionId }) => {
    test.setTimeout(90_000);
    await board(page, extensionId);
    await page.getByRole('button', { name: 'Import from Toby' }).click();
    await page.getByLabel('Toby export (.json)').setInputFiles(path.join(importsDir, realExport!));
    await page.getByLabel('Space map (optional)').setInputFiles(realMap);

    const inCards = Number(await page.getByTestId('in-cards').textContent());
    await expect(page.getByTestId('in-collections')).toHaveText('86');
    expect(inCards).toBe(454);

    // Skipping empties drops only empty collections, never cards.
    await expect(page.getByTestId('out-cards')).toHaveText(String(inCards));
    await page.getByRole('checkbox', { name: /Skip empty collections/ }).uncheck();
    await expect(page.getByTestId('out-collections')).toHaveText('86');
    await page.getByRole('checkbox', { name: /Skip empty collections/ }).check();

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Spaces' });
    await expect(nav).toContainText('My Collections');
    expect(await liveCardsInDb(page)).toBe(inCards);
    expect(await totalCardsAcrossSpaces(page)).toBe(inCards);

    // Backup → delete a space → restore → everything is back.
    await page.getByRole('button', { name: 'Settings' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download backup' }).click(),
    ]);
    const backupPath = test.info().outputPath('backup.json');
    await download.saveAs(backupPath);
    await page.getByRole('button', { name: 'Back to board' }).click();

    await nav.locator('.space-link').first().click();
    const firstSpace = (await nav.locator('.space-link').first().textContent())!;
    await page.getByRole('button', { name: `Delete ${firstSpace}` }).click();
    await expect(nav.locator('.space-link', { hasText: new RegExp(`^${firstSpace}$`) })).toHaveCount(0);
    expect(await totalCardsAcrossSpaces(page)).toBeLessThan(inCards);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Restore from backup').setInputFiles(backupPath);
    await expect(page.getByRole('status')).toContainText(`${inCards} cards`);
    expect(await liveCardsInDb(page)).toBe(inCards);
    await page.getByRole('button', { name: 'Back to board' }).click();
    expect(await totalCardsAcrossSpaces(page)).toBe(inCards);
  });
});
