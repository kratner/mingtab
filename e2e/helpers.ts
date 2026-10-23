import type { Locator, Page, Worker } from '@playwright/test';

// Shared by the tab tests: the service worker has full chrome.* access, so it
// sets up windows/groups and reports what's actually open.

export const urls = (site: string, names: (string | number)[]) => names.map((n) => `${site}/p/${n}`);

/** Opens a new window with `list` loaded; optionally groups them. Returns the window id. */
export async function openWindow(sw: Worker, list: string[], opts: { group?: { title: string; color: string }; pinFirst?: boolean } = {}) {
  return sw.evaluate(
    async ({ list, opts }) => {
      const win = await chrome.windows.create({ url: list, focused: false });
      const tabs = await chrome.tabs.query({ windowId: win!.id });
      if (opts.pinFirst) await chrome.tabs.update(tabs[0]!.id!, { pinned: true });
      if (opts.group) {
        const gid = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id!) as [number, ...number[]], createProperties: { windowId: win!.id } });
        await chrome.tabGroups.update(gid, { title: opts.group.title, color: opts.group.color as chrome.tabGroups.Color });
      }
      // Wait for titles so the pane shows "Page n".
      for (let i = 0; i < 100; i++) {
        const t = await chrome.tabs.query({ windowId: win!.id });
        if (t.every((x) => x.status === 'complete' && x.title?.startsWith('Page'))) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      return win!.id!;
    },
    { list, opts },
  );
}

/** URLs of open tabs served by the test site, in window/tab order. */
export const openSiteTabs = (sw: Worker, site: string) =>
  sw.evaluate(async (site) => {
    const wins = await chrome.windows.getAll({ populate: true });
    return wins.flatMap((w) => w.tabs ?? []).filter((t) => (t.url ?? t.pendingUrl ?? '').startsWith(site)).map((t) => ({
      url: t.url || t.pendingUrl,
      groupId: t.groupId,
      pinned: t.pinned,
    }));
  }, site);


/** Real pointer drag: press, nudge past the 6px threshold, glide to the target, release. */
export async function dragTo(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}
