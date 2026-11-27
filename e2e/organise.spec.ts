import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// 0.15: Sort by tabs / opened, Group by year / site, Restore dates from Toby, the ⋯ menu.
// Fixture: "Lisbon trip" (3 tabs), "Release" (2), "Zebra notes" (2), all in "Imported from Toby".
const data = (f: string) => path.resolve(import.meta.dirname, 'data', f);

async function setUp(page: Page, extensionId: string) {
  page.on('dialog', (d) => d.accept());
  // Saved pages open in new tabs; answer them locally so tests don't touch the network.
  await page.context().route(/^https:\/\//, (r) => r.fulfill({ body: '<title>ok</title>', contentType: 'text/html' }));
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').first().setInputFiles(data('toby-m4.json'));
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(7);
}

const order = (page: Page) =>
  page.locator('section.collection').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const sortBy = (page: Page, label: string) => page.getByRole('combobox', { name: 'Sort collections' }).selectOption({ label });
const groupBy = (page: Page, label: string) => page.getByRole('combobox', { name: 'Group collections' }).selectOption({ label });

test('the new-tab page is titled MingTab', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  await expect(page).toHaveTitle('MingTab');
});

test('sort by tab count and by when a collection was last opened', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await sortBy(page, 'Fewest tabs');
  await expect.poll(() => order(page)).toEqual(['Release', 'Zebra notes', 'Lisbon trip']);
  await sortBy(page, 'Most tabs');
  await expect.poll(() => order(page)).toEqual(['Lisbon trip', 'Release', 'Zebra notes']);
  // Sorted, so no drag handles.
  await expect(page.getByRole('button', { name: 'Drag Release' })).toHaveCount(0);

  await sortBy(page, 'Recently opened');
  await expect(page.locator('.collection-meta')).toHaveText(Array(3).fill(/never opened/));
  const opened = page.context().waitForEvent('page');
  await page.locator('section.collection[aria-label="Zebra notes"]').getByRole('link').first().click();
  await (await opened).close();
  await expect.poll(() => order(page)).toEqual(['Zebra notes', 'Lisbon trip', 'Release']);
  await expect(page.locator('section.collection[aria-label="Zebra notes"] .collection-meta')).toContainText('opened today');

  // Survives a reload (it's stored on the collection, not in the page).
  await page.reload();
  await expect.poll(() => order(page)).toEqual(['Zebra notes', 'Lisbon trip', 'Release']);
  await sortBy(page, 'Not opened lately');
  await expect.poll(() => order(page)).toEqual(['Lisbon trip', 'Release', 'Zebra notes']);
});

test('group by site regroups saved tabs and lets you select a whole site', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await groupBy(page, 'By site');
  // Most tabs first, then A–Z.
  await expect
    .poll(() => order(page))
    .toEqual(['docs.example', 'en.wikipedia.org', 'flights.example', 'alpha.example']);
  const docs = page.locator('section.collection[aria-label="docs.example"]');
  await expect(docs.locator('.card-where')).toHaveText(['in Lisbon trip', 'in Release']);

  await page.getByRole('button', { name: /^Select/ }).first().click();
  await docs.getByRole('checkbox').first().check();
  await expect(page.getByRole('toolbar', { name: 'Selected cards' })).toContainText('2');

  // The choice is remembered.
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Group collections' })).toHaveValue('site');
});

test('restore dates from Toby, then group by year saved', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  const section = page.getByRole('region', { name: 'Restore dates from Toby' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await section.getByLabel('Toby export (.json)').setInputFiles(data('toby-m4.json'));
  await section.getByLabel('Space map (.json)').setInputFiles(data('toby-m4-space-map.json'));
  await expect(section.getByTestId('dates-changes')).toHaveText('3');
  await section.getByRole('button', { name: 'Restore dates' }).click();
  await expect(section.getByRole('status')).toContainText('Restored the Toby dates on 3 collections');

  await page.getByRole('button', { name: 'Settings' }).click();
  await groupBy(page, 'By year saved');
  await expect(page.locator('.group-heading > span:first-child')).toHaveText(['2023', '2021', '2019']);
  await expect(page.getByRole('region', { name: '2019' })).toContainText('Lisbon trip');
  // Saved in 2019 and never opened: flagged.
  await expect(page.locator('section.collection[aria-label="Lisbon trip"] .collection-meta')).toHaveClass(/stale/);
  await expect(page.locator('section.collection[aria-label="Lisbon trip"] .collection-meta')).toContainText('Saved May 2019');
});

test('the ⋯ menu holds the less frequent actions and works from the keyboard', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  const more = page.getByRole('button', { name: 'More actions for Release' });
  await more.click();
  const menu = page.getByRole('menu', { name: 'Actions for Release' });
  await expect(menu.getByRole('menuitem')).toHaveText(['+Add a link', '✎Add a note', '#Tags…', '⇲Merge into…', '✕Delete collection']);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Delete Release' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  // Clicking elsewhere closes it too.
  await more.click();
  await page.locator('h2').first().click();
  await expect(menu).toHaveCount(0);
});
