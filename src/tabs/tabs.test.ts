import { describe, expect, it } from 'vitest';
import { isSavableUrl, planClose, savableTabs, sessionTitle, tabToCard } from './tabs';

const ext = 'chrome-extension://abc/';

describe('isSavableUrl', () => {
  it('keeps web pages and other chrome pages', () => {
    expect(isSavableUrl('https://example.com', ext)).toBe(true);
    expect(isSavableUrl('chrome://settings/', ext)).toBe(true);
  });
  it('skips empty, new-tab and MingTab pages', () => {
    for (const u of [undefined, '', 'about:blank', 'chrome://newtab/', 'chrome-search://local-ntp', `${ext}src/newtab/index.html`]) {
      expect(isSavableUrl(u, ext)).toBe(false);
    }
  });
});

describe('savableTabs', () => {
  it('drops pinned tabs', () => {
    const tabs = [
      { url: 'https://a.example', pinned: true },
      { url: 'https://b.example', pinned: false },
    ];
    expect(savableTabs(tabs, ext).map((t) => t.url)).toEqual(['https://b.example']);
  });
});

describe('tabToCard', () => {
  it('keeps web and data icons, drops chrome:// icons, falls back to URL for title', () => {
    expect(tabToCard({ url: 'https://a.example', title: 'A', favIconUrl: 'https://a.example/f.ico' }).favIconUrl).toBe(
      'https://a.example/f.ico',
    );
    expect(tabToCard({ url: 'chrome://settings', title: '', favIconUrl: 'chrome://theme/icon' })).toEqual({
      url: 'chrome://settings',
      title: 'chrome://settings',
      favIconUrl: '',
    });
  });
});

describe('sessionTitle', () => {
  it('names a session by date and time', () => {
    expect(sessionTitle(new Date(2026, 9, 23, 14, 5))).toBe('Session Oct 23, 2:05 PM');
  });
});

describe('planClose', () => {
  const windows = [
    { id: 1, tabIds: [10, 11, 12] },
    { id: 2, tabIds: [20, 21] },
  ];
  it('keeps a window alive only when all its tabs would close', () => {
    const plan = planClose(
      [
        { id: 10, windowId: 1 },
        { id: 20, windowId: 2 },
        { id: 21, windowId: 2 },
      ],
      windows,
    );
    expect(plan.tabIds).toEqual([10, 20, 21]);
    expect(plan.keepAliveWindowIds).toEqual([2]);
  });
});
