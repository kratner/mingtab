import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { dragTo, openWindow, urls } from './helpers';

// Collections A(a1 a2 a3), B(b1 b2), C(c1).
const fixture = path.resolve(import.meta.dirname, 'data/toby-dnd.json');

async function setUp(page: Page, extensionId: string) {
  page.on('dialog', (d) => d.accept());
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Toby export (.json)').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(6);
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Spaces' });

test('notes: add one, format it, tick its checklist; it persists', async ({ page, extensionId }) => {
  await setUp(page, extensionId);
  await page.getByRole('button', { name: 'Add note to C' }).click();
  const note = page.locator('.card.note-card');
  await note.getByRole('textbox', { name: 'Title', exact: true }).fill('Launch');
  await note.getByRole('textbox', { name: 'Note', exact: true }).fill('- [ ] write post\n- [x] **record** demo\nsee https://example.com/brief');
  await note.getByRole('button', { name: 'Save' }).click();

  await expect(note.locator('.note-title')).toContainText('Launch');
  await expect(note.getByLabel('1 of 2 done')).toBeVisible();
  await expect(note.locator('strong')).toHaveText('record');
  await expect(note.getByRole('link', { name: 'https://example.com/brief' })).toHaveAttribute('href', 'https://example.com/brief');

  await note.getByRole('checkbox', { name: 'write post (Launch)' }).check();
  await expect(note.getByLabel('2 of 2 done')).toBeVisible();
  // The tick shows at once and saves just after; wait for the saved copy before reloading.
  const savedNote = () =>
    page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const req = indexedDB.open('mingtab');
          req.onsuccess = () => {
            const all = req.result.transaction('cards').objectStore('cards').getAll();
            all.onsuccess = () => resolve((all.result as { url: string; note: string }[]).find((c) => !c.url)?.note ?? '');
          };
        }),
    );
  await expect.poll(savedNote).toContain('- [x] write post');
  await page.reload();
  await expect(page.locator('.card.note-card').getByRole('checkbox', { name: 'write post (Launch)' })).toBeChecked();
});

test('Next: queue cards and open tabs, no duplicates, reorder, complete, clear', async ({ page, extensionId, serviceWorker: sw, site }) => {
  await setUp(page, extensionId);
  for (const t of ['a1', 'b2']) {
    await page.locator('.card', { hasText: t }).hover();
    await page.getByRole('button', { name: `Add ${t} to Next` }).click();
  }
  await page.locator('.card', { hasText: 'a1' }).hover();
  await page.getByRole('button', { name: 'Add a1 to Next' }).click();
  await expect(page.locator('.card', { hasText: 'a1' }).getByRole('status')).toHaveText('Already in Next');

  await openWindow(sw, urls(site, ['queued']));
  const row = page.getByRole('complementary', { name: 'Open tabs' }).locator('.open-tab', { hasText: 'Page queued' });
  await row.hover();
  await row.getByRole('button', { name: 'Add Page queued to Next' }).click();

  await expect(nav(page).getByRole('button', { name: /▶ Next/ })).toContainText('3');
  await nav(page).getByRole('button', { name: /▶ Next/ }).click();
  const titles = () => page.getByRole('region', { name: 'Up next' }).locator('.card-title').allTextContents();
  await expect.poll(titles).toEqual(['a1', 'b2', 'Page queued']);

  const up = page.getByRole('region', { name: 'Up next' });
  await dragTo(page, up.locator('.next-item', { hasText: 'a1' }), up.locator('.next-item', { hasText: 'Page queued' }));
  await expect.poll(titles).toEqual(['b2', 'Page queued', 'a1']);

  // Ticking moves the item to Done, so click (the checkbox is re-rendered there).
  await page.getByRole('checkbox', { name: 'Mark b2 done' }).click();
  await expect.poll(titles).toEqual(['Page queued', 'a1']);
  await page.getByRole('button', { name: 'Show done (1)' }).click();
  await expect(page.getByRole('region', { name: 'Done' })).toContainText('b2');
  await page.getByRole('button', { name: 'Clear done' }).click();
  await expect(page.getByRole('region', { name: 'Done' })).toHaveCount(0);
  await expect(nav(page).getByRole('button', { name: /▶ Next/ })).toContainText('2');
});

test('to/ shortcuts: set on a card, unique, resolved the way the address bar does', async ({ page, extensionId, serviceWorker: sw }) => {
  await setUp(page, extensionId);
  const edit = async (title: string, shortcut: string) => {
    const card = page.locator('.card', { hasText: title });
    await card.hover();
    await card.getByRole('button', { name: `Edit ${title}` }).click();
    await card.getByLabel('Shortcut').fill(shortcut);
    await card.getByRole('button', { name: 'Save' }).click();
    return card;
  };
  const a1 = await edit('a1', 'Team Docs');
  await expect(a1).toContainText('to/team-docs');

  const b1 = await edit('b1', 'team-docs');
  await expect(b1.getByRole('alert')).toContainText('to/team-docs already opens "a1"');
  await b1.getByRole('button', { name: 'Cancel' }).click();

  const resolve = (text: string) => sw.evaluate((t) => (globalThis as unknown as { mingtab: { resolveOmnibox: (t: string) => Promise<string> } }).mingtab.resolveOmnibox(t), text);
  expect(await resolve('team-docs')).toBe('https://a1.example/');
  expect(await resolve('TEAM-DOCS')).toBe('https://a1.example/');
  expect(await resolve('https://picked.example/')).toBe('https://picked.example/');
  const fallback = await resolve('quarterly plan');
  expect(fallback).toBe(`chrome-extension://${extensionId}/src/newtab/index.html#search=quarterly%20plan`);

  // The fallback opens MingTab already searching.
  await page.goto(fallback);
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('quarterly plan');

  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('region', { name: 'Address-bar shortcuts' })).toContainText('to/team-docs');
});

test('toolbar button: side panel by default, popup when chosen', async ({ page, extensionId, serviceWorker: sw }) => {
  await page.goto(`chrome-extension://${extensionId}/src/newtab/index.html`);
  const state = () =>
    sw.evaluate(async () => ({
      popup: await chrome.action.getPopup({}),
      panel: (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
    }));
  await expect.poll(state).toEqual({ popup: '', panel: true });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Opens a popup' }).check();
  await expect.poll(state).toEqual({ popup: `chrome-extension://${extensionId}/src/sidepanel/index.html?popup=1`, panel: false });
  await page.getByRole('radio', { name: 'Opens the side panel' }).check();
  await expect.poll(state).toEqual({ popup: '', panel: true });
});
