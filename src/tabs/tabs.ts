import type { MingTabDB } from '../db/db';
import { createCollectionWithCards, type NewCard } from '../db/repo';
import type { Card, Collection } from '../db/schema';

// ---- pure helpers (unit-tested) --------------------------------------------

/** Chrome's tab-group colors and the swatches Chrome draws for them. */
export const GROUP_COLORS: Record<string, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#fa903e',
};

/**
 * Whether a tab is worth saving: skips empty tabs, the new-tab page and
 * MingTab's own pages. Other chrome:// pages are kept (they reopen fine).
 */
export function isSavableUrl(url: string | undefined, extensionOrigin: string): boolean {
  if (!url) return false;
  if (url === 'about:blank' || url.startsWith('chrome://newtab') || url.startsWith('chrome-search://')) return false;
  if (extensionOrigin && url.startsWith(extensionOrigin)) return false;
  return true;
}

/** Pinned tabs stay put: they're excluded from window saves and never closed. */
export function savableTabs<T extends Pick<chrome.tabs.Tab, 'url' | 'pinned'>>(tabs: T[], extensionOrigin: string): T[] {
  return tabs.filter((t) => !t.pinned && isSavableUrl(t.url, extensionOrigin));
}

export function tabToCard(tab: Pick<chrome.tabs.Tab, 'url' | 'title' | 'favIconUrl'>): NewCard {
  const icon = tab.favIconUrl ?? '';
  return {
    url: tab.url ?? '',
    title: tab.title || tab.url || '',
    // chrome:// icon URLs don't load from extension pages; keep web and data icons only.
    favIconUrl: /^(https?:|data:image\/)/.test(icon) ? icon : '',
  };
}

export function sessionTitle(d = new Date()): string {
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Session ${date}, ${time}`;
}

/** Tabs to close per window, and whether that window needs a fresh tab to stay open. */
export function planClose(
  saved: Pick<chrome.tabs.Tab, 'id' | 'windowId'>[],
  windows: { id: number; tabIds: number[] }[],
): { tabIds: number[]; keepAliveWindowIds: number[] } {
  const ids = new Set(saved.map((t) => t.id!));
  const keepAlive = windows
    .filter((w) => w.tabIds.some((id) => ids.has(id)) && w.tabIds.every((id) => ids.has(id)))
    .map((w) => w.id);
  return { tabIds: [...ids], keepAliveWindowIds: keepAlive };
}

// ---- Chrome calls -------------------------------------------------------------

export const extensionOrigin = () =>
  typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('') : '';

async function closeTabs(tabs: chrome.tabs.Tab[]) {
  const windowIds = [...new Set(tabs.map((t) => t.windowId))];
  const windows = await Promise.all(
    windowIds.map(async (id) => ({ id, tabIds: (await chrome.tabs.query({ windowId: id })).map((t) => t.id!) })),
  );
  const plan = planClose(tabs, windows);
  // Closing every tab would close the window (and a side panel in it), so
  // leave a new tab behind first.
  for (const windowId of plan.keepAliveWindowIds) await chrome.tabs.create({ windowId, active: true });
  await chrome.tabs.remove(plan.tabIds);
}

export interface SaveResult {
  collection: Collection;
  saved: number;
}

/**
 * Saves tabs as a new collection at the top of the space. Returns null when
 * nothing was savable.
 */
export async function saveTabs(
  db: MingTabDB,
  tabs: chrome.tabs.Tab[],
  opts: { spaceId: string; title: string; groupColor?: string | null; close: boolean },
): Promise<SaveResult | null> {
  const toSave = savableTabs(tabs, extensionOrigin());
  if (toSave.length === 0) return null;
  const collection = await createCollectionWithCards(db, opts.spaceId, opts.title, toSave.map(tabToCard), {
    atTop: true,
    groupColor: opts.groupColor ?? null,
  });
  if (opts.close) await closeTabs(toSave);
  return { collection, saved: toSave.length };
}

export async function saveWindow(db: MingTabDB, windowId: number, opts: { spaceId: string; close: boolean }) {
  const tabs = await chrome.tabs.query({ windowId });
  return saveTabs(db, tabs, { ...opts, title: sessionTitle() });
}

export async function saveGroup(db: MingTabDB, groupId: number, opts: { spaceId: string; close: boolean }) {
  const [group, tabs] = await Promise.all([chrome.tabGroups.get(groupId), chrome.tabs.query({ groupId })]);
  return saveTabs(db, tabs, { ...opts, title: group.title || 'Tab group', groupColor: group.color });
}

/**
 * Opens cards as tabs in the current window, in order. A collection saved
 * from a tab group comes back as a group with its title and color.
 */
export async function openCards(cards: Card[], group?: { title: string; color: string } | null): Promise<number[]> {
  const urls = cards.map((c) => c.url).filter(Boolean);
  const tabIds: number[] = [];
  for (const url of urls) tabIds.push((await chrome.tabs.create({ url, active: false })).id!);
  if (tabIds.length === 0) return [];
  if (group) {
    const groupId: number = await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] });
    await chrome.tabGroups.update(groupId, { title: group.title, color: group.color as `${chrome.tabGroups.Color}` });
  }
  await chrome.tabs.update(tabIds[0]!, { active: true });
  return tabIds;
}

export async function focusTab(tab: chrome.tabs.Tab) {
  await chrome.tabs.update(tab.id!, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

// ---- tab-group and window controls (M3) --------------------------------------

/** Groups the window's ungrouped, unpinned tabs into a new group. */
export async function groupLooseTabs(windowId: number, title = 'New group'): Promise<number | null> {
  const loose = (await chrome.tabs.query({ windowId })).filter((t) => !t.pinned && (t.groupId ?? -1) === -1);
  if (loose.length === 0) return null;
  const groupId: number = await chrome.tabs.group({
    tabIds: loose.map((t) => t.id!) as [number, ...number[]],
    createProperties: { windowId },
  });
  await chrome.tabGroups.update(groupId, { title });
  return groupId;
}

export const updateGroup = (groupId: number, changes: { title?: string; color?: string }) =>
  chrome.tabGroups.update(groupId, changes as chrome.tabGroups.UpdateProperties);

export async function ungroup(groupId: number) {
  const tabs = await chrome.tabs.query({ groupId });
  if (tabs.length) await chrome.tabs.ungroup(tabs.map((t) => t.id!) as [number, ...number[]]);
}

/** Moves every tab from other normal windows into `targetWindowId`, keeping tab groups intact. */
export async function mergeWindowsInto(targetWindowId: number) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  for (const w of windows) {
    if (w.id === targetWindowId) continue;
    const tabs = w.tabs ?? [];
    const groupIds = [...new Set(tabs.map((t) => t.groupId ?? -1).filter((g) => g !== -1))];
    for (const g of groupIds) await chrome.tabGroups.move(g, { windowId: targetWindowId, index: -1 });
    const loose = tabs.filter((t) => (t.groupId ?? -1) === -1).map((t) => t.id!);
    if (loose.length) await chrome.tabs.move(loose, { windowId: targetWindowId, index: -1 });
  }
}
