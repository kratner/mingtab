import path from 'node:path';
import { expect, test } from './fixtures';

// A(a1 a2 a3), B(b1, a note), C(c1, a1 again with a note): 6 saved tabs, 1 note, 1 duplicate.
const fixture = path.resolve(import.meta.dirname, 'data/toby-stats.json');

test('totals: tab count in the space header and sidebar, and the Stats view', async ({ page, extensionId }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(7);

  const toolbar = page.locator('.space-toolbar');
  const nav = page.getByRole('navigation', { name: 'Spaces' });
  await expect(toolbar).toContainText('3 collections · 6 tabs');
  await expect(nav.locator('.sidebar-totals')).toContainText('3 collections · 6 tabs');

  await nav.getByRole('button', { name: 'Stats' }).click();
  const tiles = page.getByRole('list', { name: 'Totals' });
  for (const [value, label] of [
    ['1', 'space'],
    ['3', 'collections'],
    ['6', 'saved tabs'],
    ['1', 'note'],
    ['1', 'tabs with a note'],
    ['0', 'empty collections'],
    ['1', 'duplicate tab'],
  ]) {
    await expect(tiles.getByRole('listitem').filter({ hasText: new RegExp(`^${value}${label}`) })).toHaveCount(1);
  }
  await expect(page.getByRole('region', { name: 'Biggest collections' }).getByRole('listitem').first()).toContainText('A 3');
  await expect(page.getByRole('region', { name: 'Most-saved sites' }).getByRole('listitem').first()).toContainText('a1.example 2');

  // The biggest collection links back to its space; the duplicate tile opens the dedupe tool.
  await page.getByRole('region', { name: 'Biggest collections' }).getByRole('button', { name: 'A' }).click();
  await expect(toolbar).toContainText('3 collections · 6 tabs');

  // Counts follow edits as they happen.
  await page.getByRole('button', { name: 'Delete a2' }).click();
  await expect(toolbar).toContainText('3 collections · 5 tabs');
  await expect(nav.locator('.sidebar-totals')).toContainText('3 collections · 5 tabs');
  await nav.getByRole('button', { name: 'Stats' }).click();
  await tiles.getByRole('button', { name: 'Review duplicates' }).click();
  await expect(page.getByRole('heading', { name: 'Duplicates' })).toBeInViewport();
});
