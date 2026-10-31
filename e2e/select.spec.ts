import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Collections A(a1 a2 a3), B(b1 b2), C(c1) in one space.
const fixture = path.resolve(import.meta.dirname, 'data/toby-dnd.json');

async function setUp(page: Page, extensionId: string, surface: 'newtab' | 'sidepanel' = 'newtab') {
  page.on('dialog', (d) => d.accept());
  await page.goto(`chrome-extension://${extensionId}/src/${surface}/index.html`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(6);
}

const titles = (page: Page, collection: string) =>
  page.getByRole('region', { name: collection, exact: true }).locator('.card-title').allTextContents();
const order = (page: Page) => page.locator('section.collection').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Selected cards' });
const notice = (page: Page) => page.getByRole('status', { name: 'Done' });

test('select across collections, shift-click a range, make a new collection, undo it', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(bar(page)).toContainText('Tick cards to select them');

  // a2, then shift-click b1: a2 a3 b1. Then the whole of C from its header box.
  await page.getByRole('checkbox', { name: 'Select a2' }).click();
  await page.getByRole('checkbox', { name: 'Select b1' }).click({ modifiers: ['Shift'] });
  await expect(bar(page).getByRole('status')).toHaveText('3 selected');
  await page.getByRole('checkbox', { name: 'Select all in C' }).check();
  await expect(bar(page).getByRole('status')).toHaveText('4 selected');
  // Clicking a card's title ticks it instead of opening it.
  await page.getByRole('region', { name: 'B', exact: true }).getByRole('link', { name: 'b2' }).click();
  await expect(bar(page).getByRole('status')).toHaveText('5 selected');
  await page.getByRole('checkbox', { name: 'Select b2' }).click();
  await expect(page.getByRole('checkbox', { name: 'Select all in B' })).toHaveJSProperty('indeterminate', true);

  await bar(page).getByRole('button', { name: 'New collection…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Picked');
  await dialog.getByRole('button', { name: 'Create' }).click();

  await expect(notice(page)).toContainText('Made "Picked" with 4 cards.');
  await expect(bar(page)).toHaveCount(0); // select mode ends once the collection is made
  await expect.poll(() => order(page)).toEqual(['Picked', 'A', 'B', 'C']);
  await expect.poll(() => titles(page, 'Picked')).toEqual(['a2', 'a3', 'b1', 'c1']);
  await expect.poll(() => titles(page, 'A')).toEqual(['a1']);
  await expect(page.locator('.space-toolbar')).toContainText('4 collections · 6 tabs');

  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => order(page)).toEqual(['A', 'B', 'C']);
  await expect.poll(() => titles(page, 'A')).toEqual(['a1', 'a2', 'a3']);
  await expect.poll(() => titles(page, 'B')).toEqual(['b1', 'b2']);
  await expect.poll(() => titles(page, 'C')).toEqual(['c1']);
});

test('copy, move and delete from the bar; Esc leaves select mode', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select a1' }).click();

  await bar(page).getByRole('button', { name: 'Copy to…' }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Collection' }).selectOption({ label: 'C' });
  await page.getByRole('dialog').getByRole('button', { name: 'Copy' }).click();
  await expect(notice(page)).toContainText('Copied 1 card to "C".');
  await expect.poll(() => titles(page, 'C')).toEqual(['c1', 'a1']);
  await expect.poll(() => titles(page, 'A')).toEqual(['a1', 'a2', 'a3']);
  await expect(bar(page).getByRole('status')).toHaveText('Tick cards to select them'); // cleared, still selecting

  await page.getByRole('checkbox', { name: 'Select all in B' }).check();
  await bar(page).getByRole('button', { name: 'Move to…' }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Collection' }).selectOption({ label: 'A' });
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
  await expect.poll(() => titles(page, 'A')).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
  await expect.poll(() => titles(page, 'B')).toEqual([]);

  await page.getByRole('checkbox', { name: 'Select a2' }).click();
  await page.getByRole('checkbox', { name: 'Select b2' }).click();
  await bar(page).getByRole('button', { name: 'Delete' }).click();
  await expect(notice(page)).toContainText('Deleted 2 cards.');
  await expect.poll(() => titles(page, 'A')).toEqual(['a1', 'a3', 'b1']);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => titles(page, 'A')).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);

  // A dialog's Esc closes the dialog only; the next Esc leaves select mode.
  await page.getByRole('checkbox', { name: 'Select a3' }).click();
  await bar(page).getByRole('button', { name: 'Move to…' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Select a3' })).toHaveCount(0);
});

test('select from search results, mixed with cards picked on the board', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select c1' }).click();

  await page.getByRole('searchbox', { name: 'Search' }).fill('b');
  const results = page.getByRole('region', { name: 'Saved tabs' });
  await results.getByRole('checkbox', { name: 'Select all in Saved tabs' }).check();
  await expect(bar(page).getByRole('status')).toContainText('3 selected');
  await expect(bar(page).getByRole('status')).toContainText('1 not shown here');

  await bar(page).getByRole('button', { name: 'New collection…' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('Mixed');
  await page.getByRole('dialog').getByRole('radio', { name: /Copy them here/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

  // Lands on the space with the new collection; copies leave the originals.
  await expect.poll(() => titles(page, 'Mixed')).toEqual(['b1', 'b2', 'c1']);
  await expect.poll(() => titles(page, 'B')).toEqual(['b1', 'b2']);
  await expect.poll(() => titles(page, 'C')).toEqual(['c1']);
});

test('side panel: select and move', async ({ page, extensionId }) => {
  await setUp(page, extensionId, 'sidepanel');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select a3' }).click();
  await bar(page).getByRole('button', { name: 'Move to…' }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Collection' }).selectOption({ label: 'C' });
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
  await expect.poll(() => titles(page, 'C')).toEqual(['c1', 'a3']);
});
