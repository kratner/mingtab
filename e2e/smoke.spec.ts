import { expect, test } from './fixtures';

test('side panel page renders the app', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await expect(page.getByRole('heading', { name: 'MingTab' })).toBeVisible();
  await expect(page.locator('.app')).toHaveAttribute('data-surface', 'sidepanel');
});

test('new tab is overridden by MingTab', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('chrome://newtab');
  await expect(page.getByRole('heading', { name: 'MingTab' })).toBeVisible();
  await expect(page.locator('.app')).toHaveAttribute('data-surface', 'newtab');
});

test('toolbar icon is set to open the side panel', async ({ serviceWorker }) => {
  // onInstalled runs asynchronously after the worker starts, so poll.
  await expect
    .poll(() =>
      serviceWorker.evaluate(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick),
    )
    .toBe(true);
});
