import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openWindow, urls } from './helpers';

// Collections: "Lisbon trip" (3 cards, one with a note), "Release" (2), "Zebra notes" (2).
// Two pages are saved twice: the Lisbon Wikipedia page (trailing slash) and the
// flights page (utm_source parameter).
const fixture = path.resolve(import.meta.dirname, 'data/toby-m4.json');

async function setUp(page: Page, extensionId: string, surface: 'newtab' | 'sidepanel' = 'newtab') {
  page.on('dialog', (d) => d.accept());
  await page.goto(`chrome-extension://${extensionId}/src/${surface}/index.html`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(7);
}

const order = (page: Page) =>
  page.locator('section.collection').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const results = (page: Page, group: string) =>
  page.getByRole('region', { name: group, exact: true }).locator('.result-title').allTextContents();

test('search finds cards by title, URL and note, with where-it-lives; Esc clears', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  const box = page.getByRole('searchbox', { name: 'Search' });

  await box.fill('alfama');
  await expect.poll(() => results(page, 'Saved tabs')).toEqual(['Hotel list']);
  await expect(page.getByRole('region', { name: 'Saved tabs' })).toContainText('Imported from Toby › Lisbon trip');

  await box.fill('wikipedia');
  await expect.poll(() => results(page, 'Saved tabs')).toEqual(['Lisbon - Wikipedia', 'Lisbon again']);

  await box.fill('lisbon');
  // Title matches first; "Flights to Portugal" only has lisbon in its URL.
  await expect.poll(async () => (await results(page, 'Saved tabs')).at(-1)).toMatch(/Flights/);
  await expect.poll(() => results(page, 'Collections')).toEqual(['Lisbon trip']);

  await box.press('Escape');
  await expect(box).toHaveValue('');
  await expect(page.locator('section.collection')).toHaveCount(3);
});

test('"/" focuses search; a collection result jumps to it and highlights it', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.locator('body').click();
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search' })).toBeFocused();
  await page.keyboard.type('zebra');
  await page.getByRole('region', { name: 'Collections' }).getByRole('button', { name: /Zebra notes/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Zebra notes' })).toHaveClass(/flash/);
});

test('search includes open tabs; clicking one switches to it', async ({ page, extensionId, serviceWorker: sw, site }) => {
  await setUp(page, extensionId);
  await openWindow(sw, urls(site, ['quarterly-report']));
  await page.getByRole('searchbox', { name: 'Search' }).fill('quarterly');
  const tabs = page.getByRole('region', { name: 'Open tabs', exact: true });
  await expect(tabs.locator('.result-title')).toHaveText(['Page quarterly-report']);
  await tabs.getByRole('button').first().click();
  await expect
    .poll(() => sw.evaluate(async (site) => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url?.startsWith(site), site))
    .toBe(true);
});

test('search works in the side panel even on the Open tabs view', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await setUp(page, extensionId, 'sidepanel');
  await page.getByRole('tab', { name: 'Open tabs' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('release plan');
  await expect.poll(() => results(page, 'Saved tabs')).toEqual(['Release plan']);
});

test('tags: add, filter by tag, remove; persist after reload', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  for (const name of ['Lisbon trip', 'Zebra notes']) {
    await page.getByRole('button', { name: `Tag ${name}` }).click();
    const input = page.getByRole('combobox', { name: `Add tag to ${name}` });
    await input.fill(name === 'Lisbon trip' ? 'Travel' : 'travel'); // same tag, any case
    await input.press('Enter');
    await page.getByRole('button', { name: `Tag ${name}` }).click();
  }
  await page.reload();
  await expect(page.getByRole('region', { name: 'Lisbon trip' }).locator('.tag-chip')).toHaveText('Travel');

  await page.getByRole('combobox', { name: 'Filter by tag' }).selectOption({ label: 'Travel' });
  await expect.poll(() => order(page)).toEqual(['Lisbon trip', 'Zebra notes']);
  await expect(page.getByRole('button', { name: /^Drag / })).toHaveCount(0); // no reordering while filtered

  await page.getByRole('combobox', { name: 'Filter by tag' }).selectOption({ label: 'All tags' });
  await page.getByRole('button', { name: 'Tag Zebra notes' }).click();
  await page.getByRole('button', { name: 'Remove tag Travel from Zebra notes' }).click();
  await expect(page.getByRole('region', { name: 'Zebra notes' }).locator('.tag-chip')).toHaveCount(0);
});

test('Starred shows starred collections from every space', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.getByRole('button', { name: 'Star Release' }).click();
  const nav = page.getByRole('navigation', { name: 'Spaces' });
  await nav.getByRole('button', { name: '★ Starred' }).click();
  await expect.poll(() => order(page)).toEqual(['Release']);
  await page.getByRole('button', { name: 'Imported from Toby ›' }).click();
  await expect.poll(() => order(page)).toEqual(['Lisbon trip', 'Release', 'Zebra notes']);
});

test('sort, expand/collapse all, compact', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  const sort = page.getByRole('combobox', { name: 'Sort collections' });
  await sort.selectOption('za');
  await expect.poll(() => order(page)).toEqual(['Zebra notes', 'Release', 'Lisbon trip']);
  await expect(page.getByRole('button', { name: /^Drag / })).toHaveCount(0);
  await sort.selectOption('custom');
  await expect.poll(() => order(page)).toEqual(['Lisbon trip', 'Release', 'Zebra notes']);
  await expect(page.getByRole('button', { name: /^Drag / })).toHaveCount(3);

  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.locator('.card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.locator('.card')).toHaveCount(7);

  await page.getByRole('checkbox', { name: 'Compact' }).check();
  await expect(page.locator('.card-host').first()).toBeHidden();
});

test('duplicates: finds both pages saved twice, removes only what you confirm', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Find duplicates' }).click();
  const found = page.getByRole('status', { name: 'Duplicates found' });
  await expect(found).toContainText('2 pages saved more than once; 2 cards selected');

  // Keep both copies of the Wikipedia page: untick its second copy.
  await page.getByRole('checkbox', { name: /^Remove copy 2 of Lisbon again/ }).uncheck();
  await expect(found).toContainText('1 card selected');
  await page.getByRole('button', { name: 'Remove 1 selected' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Removed 1 duplicate card.' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to board' }).click();
  await expect(page.locator('.card')).toHaveCount(6);
  await expect(page.getByRole('region', { name: 'Zebra notes' })).not.toContainText('Flights copy');
  await expect(page.getByRole('region', { name: 'Release' })).toContainText('Lisbon again');
});
