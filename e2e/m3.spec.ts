import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { dragTo, openSiteTabs, openWindow, urls } from './helpers';

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

const collectionOrder = (page: Page) =>
  page.locator('section.collection').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const cardTitles = (page: Page, collection: string) =>
  page.getByRole('region', { name: collection, exact: true }).locator('.card-title').allTextContents();

test('drag a collection by its handle to reorder; order persists', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  expect(await collectionOrder(page)).toEqual(['A', 'B', 'C']);
  await dragTo(page, page.getByRole('button', { name: 'Drag A' }), page.getByRole('region', { name: 'C', exact: true }));
  await expect.poll(() => collectionOrder(page)).toEqual(['B', 'C', 'A']);
  await page.reload();
  await expect.poll(() => collectionOrder(page)).toEqual(['B', 'C', 'A']);
});

test('keyboard: Space to pick up, arrows to move, Space to drop', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 400, height: 900 });
  await setUp(page, extensionId, 'sidepanel');
  await page.getByRole('button', { name: 'Drag A' }).focus();
  for (const key of ['Space', 'ArrowDown', 'ArrowDown', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
  }
  await expect.poll(() => collectionOrder(page)).toEqual(['B', 'C', 'A']);
});

test('drag a card onto a card in another collection; it lands before that card', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  const b = page.getByRole('region', { name: 'B', exact: true });
  await dragTo(page, page.locator('.card', { hasText: 'a2' }), b.locator('.card', { hasText: 'b2' }));
  await expect.poll(() => cardTitles(page, 'B')).toEqual(['b1', 'a2', 'b2']);
  await expect.poll(() => cardTitles(page, 'A')).toEqual(['a1', 'a3']);
});

test('reorder cards within a collection', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  const a = page.getByRole('region', { name: 'A', exact: true });
  await dragTo(page, a.locator('.card', { hasText: 'a1' }), a.locator('.card', { hasText: 'a3' }));
  await expect.poll(() => cardTitles(page, 'A')).toEqual(['a2', 'a3', 'a1']);
});

test('a plain click on a card still opens the link (no accidental drag)', async ({ page, context, extensionId }) => {
  await context.route('https://a1.example/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>a1</title>' }));
  await setUp(page, extensionId);
  const opened = context.waitForEvent('page');
  await page.getByRole('link', { name: 'a1' }).click();
  const tab = await opened;
  await tab.waitForLoadState();
  expect(tab.url()).toBe('https://a1.example/');
  await expect.poll(() => cardTitles(page, 'A')).toEqual(['a1', 'a2', 'a3']);
});

test('drag an open tab into a collection; the tab stays open', async ({ page, extensionId, serviceWorker: sw, site }) => {
  await setUp(page, extensionId);
  await openWindow(sw, urls(site, ['dragme']));
  const row = page.getByRole('complementary', { name: 'Open tabs' }).locator('.open-tab', { hasText: 'Page dragme' });
  await dragTo(page, row, page.getByRole('region', { name: 'C', exact: true }).locator('.collection-header'));
  await expect.poll(() => cardTitles(page, 'C')).toEqual(['c1', 'Page dragme']);
  expect(await openSiteTabs(sw, site)).toHaveLength(1);
});

test('drag a collection onto another space in the sidebar', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  const nav = page.getByRole('navigation', { name: 'Spaces' });
  await nav.getByRole('button', { name: 'New space' }).click();
  await page.getByRole('textbox', { name: 'New space name' }).fill('Two');
  await page.getByRole('textbox', { name: 'New space name' }).press('Enter');
  await nav.getByRole('button', { name: 'Imported from Toby', exact: true }).click();

  await dragTo(page, page.getByRole('button', { name: 'Drag B' }), nav.getByRole('button', { name: 'Two', exact: true }));
  await expect.poll(() => collectionOrder(page)).toEqual(['A', 'C']);
  await nav.getByRole('button', { name: 'Two', exact: true }).click();
  await expect.poll(() => collectionOrder(page)).toEqual(['B']);
  await expect.poll(() => cardTitles(page, 'B')).toEqual(['b1', 'b2']);
});

test('merge a collection into another', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.getByRole('button', { name: 'Merge A into another collection' }).click();
  await page.getByRole('combobox', { name: 'Merge A into' }).selectOption({ label: 'B' });
  await expect.poll(() => collectionOrder(page)).toEqual(['B', 'C']);
  await expect.poll(() => cardTitles(page, 'B')).toEqual(['b1', 'b2', 'a1', 'a2', 'a3']);
});

test('tab-group controls: group, rename, recolor, ungroup; merge windows', async ({
  page,
  extensionId,
  serviceWorker: sw,
  site,
}) => {
  await setUp(page, extensionId);
  await openWindow(sw, urls(site, ['w1', 'w2']));
  await openWindow(sw, urls(site, ['x1']));
  const pane = page.getByRole('complementary', { name: 'Open tabs' });
  const win = pane.locator('section.window').filter({ hasText: 'Page w1' });

  await win.getByRole('button', { name: 'Group', exact: true }).click();
  const group = pane.getByRole('group', { name: 'Tab group New group' });
  await expect(group).toBeVisible();

  await group.getByRole('button', { name: /^Group name: New group/ }).click();
  await page.getByRole('textbox', { name: 'Group name' }).fill('Work');
  await page.getByRole('textbox', { name: 'Group name' }).press('Enter');
  const work = pane.getByRole('group', { name: 'Tab group Work' });
  await work.getByRole('combobox', { name: 'Color of Work' }).selectOption('purple');

  const groupOf = () =>
    sw.evaluate(async (site) => {
      const t = (await chrome.tabs.query({})).find((x) => x.url?.startsWith(`${site}/p/w1`))!;
      return t.groupId === -1 ? null : chrome.tabGroups.get(t.groupId);
    }, site);
  await expect.poll(async () => (await groupOf())?.title).toBe('Work');
  await expect.poll(async () => (await groupOf())?.color).toBe('purple');

  await work.getByRole('button', { name: 'Ungroup Work' }).click();
  await expect.poll(groupOf).toBeNull();

  // Three windows (board + 2) → one.
  await pane.getByRole('button', { name: 'Merge windows' }).click();
  await expect
    .poll(() => sw.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['normal'] })).length))
    .toBe(1);
  expect(await openSiteTabs(sw, site)).toHaveLength(3);
});
