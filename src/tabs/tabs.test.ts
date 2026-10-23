import { describe, expect, it } from 'vitest';
import { isSavableUrl, planClose, planRestore, savableTabs, sessionTitle, snapshotWindows, tabToCard } from './tabs';

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
    expect(sessionTitle(new Date(2026, 9, 23, 14, 5), 'All windows')).toBe('All windows Oct 23, 2:05 PM');
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

describe('planClose with a window to keep', () => {
  it('closes the other emptied windows outright and keeps only that one alive', () => {
    const plan = planClose(
      [
        { id: 10, windowId: 1 },
        { id: 11, windowId: 1 },
        { id: 20, windowId: 2 },
        { id: 21, windowId: 2 },
        { id: 30, windowId: 3 },
      ],
      [
        { id: 1, tabIds: [10, 11] },
        { id: 2, tabIds: [20, 21] },
        { id: 3, tabIds: [30, 31] },
      ],
      1,
    );
    expect(plan).toEqual({ tabIds: [10, 11, 30], keepAliveWindowIds: [1], closeWindowIds: [2] });
  });
});

const tab = (id: number, url: string, extra: Partial<chrome.tabs.Tab> = {}) =>
  ({ id, url, title: url, groupId: -1, pinned: false, ...extra }) as chrome.tabs.Tab;

describe('snapshotWindows', () => {
  const groups = new Map([
    [7, { title: 'Research', color: 'green' as const, collapsed: true }],
    [8, { title: '', color: 'blue' as const, collapsed: false }],
  ]);

  it('records each window, its groups, and where every tab sat', () => {
    const snap = snapshotWindows(
      [
        {
          id: 1,
          state: 'normal',
          left: 10,
          top: 20,
          width: 800,
          height: 600,
          incognito: false,
          tabs: [tab(1, 'https://a.example', { groupId: 7 }), tab(2, 'https://b.example', { groupId: 7 }), tab(3, 'https://c.example')],
        },
        { id: 2, state: 'maximized', incognito: false, tabs: [tab(4, 'chrome://newtab/')] },
        {
          id: 3,
          state: 'maximized',
          left: 1440,
          top: 0,
          width: 1920,
          height: 1080,
          incognito: false,
          tabs: [tab(5, 'https://pinned.example', { pinned: true }), tab(6, 'https://d.example', { groupId: 8 })],
        },
        { id: 4, state: 'normal', incognito: true, tabs: [tab(7, 'https://private.example')] },
      ],
      groups,
      3,
      ext,
    );
    expect(snap.session).toEqual({
      windows: [
        { state: 'normal', left: 10, top: 20, width: 800, height: 600, focused: false },
        { state: 'maximized', left: 1440, top: 0, width: 1920, height: 1080, focused: true },
      ],
      groups: [
        { title: 'Research', color: 'green', collapsed: true },
        { title: '', color: 'blue', collapsed: false },
      ],
    });
    expect(snap.cards.map((c) => [c.url, c.layout])).toEqual([
      ['https://a.example', { window: 0, group: 0 }],
      ['https://b.example', { window: 0, group: 0 }],
      ['https://c.example', { window: 0, group: null }],
      ['https://d.example', { window: 1, group: 1 }],
    ]);
    expect(snap.tabs.map((t) => t.id)).toEqual([1, 2, 3, 6]);
  });
});

describe('planRestore', () => {
  const session = {
    windows: [
      { state: 'normal' as const, left: 0, top: 0, width: 800, height: 600, focused: false },
      { state: 'normal' as const, focused: true },
      { state: 'maximized' as const, focused: false },
    ],
    groups: [{ title: 'G', color: 'red', collapsed: false }],
  };

  it('puts tabs back in their windows and groups, in card order', () => {
    const plan = planRestore(
      [
        { url: 'https://a.example', layout: { window: 0, group: 0 } },
        { url: 'https://b.example', layout: { window: 1, group: null } },
        { url: 'https://c.example', layout: { window: 0, group: null } },
      ],
      session,
    );
    expect(plan.map((w) => [w.window.focused, w.tabs])).toEqual([
      [false, [{ url: 'https://a.example', group: 0 }, { url: 'https://c.example', group: null }]],
      [true, [{ url: 'https://b.example', group: null }]],
    ]);
  });

  it('sends cards with no layout, or one that points nowhere, to the first window', () => {
    const plan = planRestore(
      [
        { url: 'https://new.example' },
        { url: 'https://lost.example', layout: { window: 9, group: 0 } },
        { url: 'https://g.example', layout: { window: 0, group: 5 } },
        { url: '', layout: { window: 1, group: null } },
      ],
      session,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.tabs).toEqual([
      { url: 'https://new.example', group: null },
      { url: 'https://lost.example', group: null },
      { url: 'https://g.example', group: null },
    ]);
  });
});
