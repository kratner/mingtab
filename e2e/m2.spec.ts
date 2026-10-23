import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSiteTabs, openWindow, urls } from './helpers';

// The service worker has full chrome.* access, so tests use it to set up
// windows/groups and to check what's actually open in the browser.

async function board(page: Page, extensionId: string) {
  page.on('dialog', (d) => d.accept());
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  await page.getByRole('button', { name: 'Create a space' }).click();
  await expect(page.getByRole('navigation', { name: 'Spaces' })).toContainText('My Collections');
}

const windowWith = (page: Page, text: string) =>
  page.getByRole('complementary', { name: 'Open tabs' }).locator('section.window').filter({ hasText: text });

test('save a window: tabs close, collection has them in order; Open all restores them', async ({
  page,
  extensionId,
  serviceWorker: sw,
  site,
}) => {
  await board(page, extensionId);
  const five = urls(site, [1, 2, 3, 4, 5]);
  const winId = await openWindow(sw, five);

  await windowWith(page, 'Page 1').getByRole('button', { name: 'Save window' }).click();
  await expect(page.getByRole('complementary', { name: 'Open tabs' }).getByRole('status')).toContainText('Saved 5 tabs');

  await expect.poll(() => openSiteTabs(sw, site)).toHaveLength(0);
  // The window had only saved tabs, so a new tab was left to keep it open.
  expect(await sw.evaluate((id) => chrome.windows.get(id).then(() => true, () => false), winId)).toBe(true);

  const collection = page.locator('section.collection').filter({ has: page.getByRole('button', { name: /^Collection title: Session / }) });
  await expect(collection.locator('a.card-title')).toHaveCount(5);
  expect(await collection.locator('a.card-title').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))).toEqual(five);
  await expect(collection.locator('.card').first()).toContainText('Page 1');

  await collection.getByRole('button', { name: /^Open all in / }).click();
  await expect.poll(async () => (await openSiteTabs(sw, site)).map((t) => t.url)).toEqual(five);
});

test('save a tab group: comes back as a group with the same title and color', async ({
  page,
  extensionId,
  serviceWorker: sw,
  site,
}) => {
  await board(page, extensionId);
  const three = urls(site, ['g1', 'g2', 'g3']);
  await openWindow(sw, three, { group: { title: 'Research', color: 'green' } });

  await page.getByRole('group', { name: 'Tab group Research' }).getByRole('button', { name: 'Save group' }).click();
  await expect(page.getByRole('complementary', { name: 'Open tabs' }).getByRole('status')).toContainText('Saved 3 tabs to "Research"');
  await expect.poll(() => openSiteTabs(sw, site)).toHaveLength(0);

  const collection = page.getByRole('region', { name: 'Research' });
  await expect(collection.locator('.card')).toHaveCount(3);
  await expect(collection.locator('.group-dot')).toHaveAttribute('title', /green tab group/);

  await collection.getByRole('button', { name: 'Open all in Research' }).click();
  await expect.poll(async () => (await openSiteTabs(sw, site)).map((t) => t.url)).toEqual(three);
  const reopened = await openSiteTabs(sw, site);
  const groupIds = new Set(reopened.map((t) => t.groupId));
  expect(groupIds.size).toBe(1);
  const group = await sw.evaluate((id) => chrome.tabGroups.get(id), [...groupIds][0]!);
  expect(group).toMatchObject({ title: 'Research', color: 'green' });
});

test('with "close after saving" off, tabs stay open; pinned tabs are never saved', async ({
  page,
  extensionId,
  serviceWorker: sw,
  site,
}) => {
  await board(page, extensionId);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: /Close tabs after saving/ }).uncheck();
  await page.getByRole('button', { name: 'Back to board' }).click();

  const list = urls(site, ['pinned', 'k1', 'k2']);
  await openWindow(sw, list, { pinFirst: true });
  await windowWith(page, 'Page k1').getByRole('button', { name: 'Save window' }).click();
  await expect(page.getByRole('complementary', { name: 'Open tabs' }).getByRole('status')).toContainText('Saved 2 tabs');

  const open = await openSiteTabs(sw, site);
  expect(open.map((t) => t.url).sort()).toEqual([...list].sort());
  const collection = page.locator('section.collection').first();
  await expect(collection.locator('.card')).toHaveCount(2);
  await expect(collection).not.toContainText('Page pinned');
});

test('save a single tab into a collection (or a new one)', async ({ page, extensionId, serviceWorker: sw, site }) => {
  await board(page, extensionId);
  await openWindow(sw, urls(site, ['solo']));

  const pane = page.getByRole('complementary', { name: 'Open tabs' });
  const row = pane.locator('.open-tab').filter({ hasText: 'Page solo' });
  await row.hover();
  await row.getByRole('button', { name: 'Save Page solo' }).click();
  await row.getByRole('combobox', { name: 'Save Page solo to collection' }).selectOption({ label: '+ New collection' });

  const collection = page.getByRole('region', { name: 'Saved tabs' });
  await expect(collection.locator('.card')).toHaveCount(1);
  await expect(collection).toContainText('Page solo');
  // Single-tab saves never close the tab.
  expect(await openSiteTabs(sw, site)).toHaveLength(1);
});

test('side panel switches between saved collections and open tabs', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await page.getByRole('tab', { name: 'Open tabs' }).click();
  await expect(page.getByRole('complementary', { name: 'Open tabs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a space' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Saved' }).click();
  await expect(page.getByRole('button', { name: 'Create a space' })).toBeVisible();
});

test('save all windows in one click: one collection, then Open all rebuilds the windows and groups', async ({
  page,
  extensionId,
  serviceWorker: sw,
  site,
}) => {
  await board(page, extensionId);
  const first = urls(site, ['w1a', 'w1b']);
  const second = urls(site, ['w2a', 'w2b', 'w2c']);
  await openWindow(sw, first);
  const secondId = await openWindow(sw, second, { group: { title: 'Research', color: 'green' } });
  await sw.evaluate((id) => chrome.windows.update(id, { left: 40, top: 60, width: 700, height: 500 }), secondId);

  await page.getByRole('complementary', { name: 'Open tabs' }).getByRole('button', { name: 'Save all' }).click();
  await expect(page.getByRole('complementary', { name: 'Open tabs' }).getByRole('status')).toContainText(
    'Saved 5 tabs from 2 windows to "All windows',
  );
  await expect.poll(() => openSiteTabs(sw, site)).toHaveLength(0);
  // Emptied windows close outright instead of each keeping a new tab.
  await expect.poll(() => sw.evaluate((id) => chrome.windows.get(id).then(() => true, () => false), secondId)).toBe(false);

  const collection = page.locator('section.collection').filter({ has: page.getByRole('button', { name: /^Collection title: All windows / }) });
  await expect(collection.locator('.card')).toHaveCount(5);
  await expect(collection).toContainText('2 windows');

  await collection.getByRole('button', { name: /^Open all in / }).click();
  await expect.poll(async () => (await openSiteTabs(sw, site)).length).toBe(5);
  const reopened = await sw.evaluate(async (site) => {
    const wins = await chrome.windows.getAll({ populate: true });
    return Promise.all(
      wins
        .filter((w) => (w.tabs ?? []).some((t) => (t.url || t.pendingUrl || '').startsWith(site)))
        .map(async (w) => ({
          urls: w.tabs!.map((t) => t.url || t.pendingUrl),
          left: w.left,
          top: w.top,
          groups: await Promise.all(
            [...new Set(w.tabs!.map((t) => t.groupId).filter((g) => g !== -1))].map((g) => chrome.tabGroups.get(g!)),
          ),
        })),
    );
  }, site);
  const byFirst = (u: string) => reopened.find((w) => w.urls[0] === u)!;
  expect(byFirst(first[0]!).urls).toEqual(first);
  expect(byFirst(first[0]!).groups).toHaveLength(0);
  expect(byFirst(second[0]!).urls).toEqual(second);
  // Position, not size: Playwright resizes every page it attaches to to its 1280×720 viewport.
  expect(byFirst(second[0]!)).toMatchObject({ left: 40, top: 60 });
  expect(byFirst(second[0]!).groups).toMatchObject([{ title: 'Research', color: 'green' }]);
});
