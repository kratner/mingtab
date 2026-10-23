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

test('the extension has its fixed ID (manifest key), the one Google sign-in redirects to', async ({ extensionId }) => {
  expect(extensionId).toBe('jclkedgbnlmbonoihhobgnmdoehmddpo');
});

test('the welcome screen links to About, which explains the name', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await page.getByRole('button', { name: 'Why "bright hall"?' }).click();
  const about = page.getByRole('region', { name: 'About MingTab' });
  await expect(about).toBeInViewport();
  await expect(about).toContainText('明堂');
  await expect(about).toContainText('the bright hall');
  await expect(about.getByRole('img', { name: /明 in a bright doorway/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('about.png') });
});
