import type { MingTabDB } from '../db/db';
import { createCollectionWithCards, type NewCard } from '../db/repo';
import type { Card, Collection, SessionLayout, SessionWindow } from '../db/schema';

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

export function sessionTitle(d = new Date(), prefix = 'Session'): string {
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${prefix} ${date}, ${time}`;
}

/**
 * Tabs to close per window, and whether that window needs a fresh tab to stay
 * open. With `keepWindowId` (saving all windows), only that window is kept
 * alive; the other emptied windows are closed outright.
 */
export function planClose(
  saved: Pick<chrome.tabs.Tab, 'id' | 'windowId'>[],
  windows: { id: number; tabIds: number[] }[],
  keepWindowId?: number,
): { tabIds: number[]; keepAliveWindowIds: number[]; closeWindowIds: number[] } {
  const ids = new Set(saved.map((t) => t.id!));
  const emptied = windows.filter((w) => w.tabIds.some((id) => ids.has(id)) && w.tabIds.every((id) => ids.has(id)));
  if (keepWindowId === undefined) return { tabIds: [...ids], keepAliveWindowIds: emptied.map((w) => w.id), closeWindowIds: [] };
  const closing = emptied.filter((w) => w.id !== keepWindowId);
  const inClosing = new Set(closing.flatMap((w) => w.tabIds));
  return {
    tabIds: [...ids].filter((id) => !inClosing.has(id)),
    keepAliveWindowIds: emptied.filter((w) => w.id === keepWindowId).map((w) => w.id),
    closeWindowIds: closing.map((w) => w.id),
  };
}

type WindowLike = Pick<chrome.windows.Window, 'id' | 'state' | 'left' | 'top' | 'width' | 'height' | 'incognito'> & {
  tabs?: chrome.tabs.Tab[];
};
type GroupLike = Pick<chrome.tabGroups.TabGroup, 'title' | 'color' | 'collapsed'>;

const STATES: SessionWindow['state'][] = ['normal', 'maximized', 'fullscreen', 'minimized'];

/**
 * Everything open, for a one-click save: the savable tabs of every window as
 * cards that point at their window and tab group, plus those windows (size,
 * place, state) and groups. Windows with nothing savable are left out.
 */
export function snapshotWindows(
  windows: WindowLike[],
  groups: Map<number, GroupLike>,
  currentWindowId: number | undefined,
  origin: string,
): { cards: NewCard[]; tabs: chrome.tabs.Tab[]; session: SessionLayout } {
  const session: SessionLayout = { windows: [], groups: [] };
  const cards: NewCard[] = [];
  const tabs: chrome.tabs.Tab[] = [];
  for (const w of windows) {
    if (w.incognito) continue;
    const saved = savableTabs(w.tabs ?? [], origin);
    if (saved.length === 0) continue;
    const window = session.windows.length;
    session.windows.push({
      state: STATES.includes(w.state as SessionWindow['state']) ? (w.state as SessionWindow['state']) : 'normal',
      ...bounds(w),
      focused: w.id === currentWindowId,
    });
    const groupIndex = new Map<number, number>();
    for (const t of saved) {
      const g = groups.get(t.groupId ?? -1);
      if (g && !groupIndex.has(t.groupId!)) {
        groupIndex.set(t.groupId!, session.groups.length);
        session.groups.push({ title: g.title ?? '', color: g.color, collapsed: g.collapsed });
      }
      cards.push({ ...tabToCard(t), layout: { window, group: g ? groupIndex.get(t.groupId!)! : null } });
      tabs.push(t);
    }
  }
  return { cards, tabs, session };
}

/** Only the bounds Chrome reported (undefined ones would be rejected by chrome.windows.create). */
function bounds(w: Pick<SessionWindow, 'left' | 'top' | 'width' | 'height'>) {
  const out: Pick<SessionWindow, 'left' | 'top' | 'width' | 'height'> = {};
  for (const k of ['left', 'top', 'width', 'height'] as const) if (typeof w[k] === 'number') out[k] = w[k];
  return out;
}

export interface RestoreWindow {
  window: SessionWindow;
  tabs: { url: string; group: number | null }[];
}

/**
 * Which tabs go in which window when a session reopens, in card order. Cards
 * added after the save (no layout, or one that points nowhere) join the first
 * window; windows left with no cards are skipped.
 */
export function planRestore(cards: Pick<Card, 'url' | 'layout'>[], session: SessionLayout): RestoreWindow[] {
  const plan: RestoreWindow[] = session.windows.map((window) => ({ window, tabs: [] }));
  if (plan.length === 0) plan.push({ window: { state: 'normal', focused: true }, tabs: [] });
  for (const c of cards) {
    if (!c.url) continue;
    const at = c.layout?.window ?? -1;
    const inPlace = at >= 0 && at < plan.length;
    const group = c.layout?.group ?? null;
    plan[inPlace ? at : 0]!.tabs.push({
      url: c.url,
      group: inPlace && group !== null && group >= 0 && group < session.groups.length ? group : null,
    });
  }
  return plan.filter((w) => w.tabs.length > 0);
}

// ---- Chrome calls -------------------------------------------------------------

export const extensionOrigin = () =>
  typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('') : '';

async function closeTabs(tabs: chrome.tabs.Tab[], keepWindowId?: number) {
  const windowIds = [...new Set(tabs.map((t) => t.windowId))];
  const windows = await Promise.all(
    windowIds.map(async (id) => ({ id, tabIds: (await chrome.tabs.query({ windowId: id })).map((t) => t.id!) })),
  );
  const plan = planClose(tabs, windows, keepWindowId);
  // Closing every tab would close the window (and a side panel in it), so
  // leave a new tab behind first.
  for (const windowId of plan.keepAliveWindowIds) await chrome.tabs.create({ windowId, active: true });
  for (const windowId of plan.closeWindowIds) await chrome.windows.remove(windowId);
  if (plan.tabIds.length) await chrome.tabs.remove(plan.tabIds);
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

/** Saves the window's tabs; a blank `title` falls back to a dated "Session" name. */
export async function saveWindow(db: MingTabDB, windowId: number, opts: { spaceId: string; close: boolean; title?: string }) {
  const tabs = await chrome.tabs.query({ windowId });
  return saveTabs(db, tabs, { ...opts, title: opts.title?.trim() || sessionTitle() });
}

export async function saveGroup(db: MingTabDB, groupId: number, opts: { spaceId: string; close: boolean }) {
  const [group, tabs] = await Promise.all([chrome.tabGroups.get(groupId), chrome.tabs.query({ groupId })]);
  return saveTabs(db, tabs, { ...opts, title: group.title || 'Tab group', groupColor: group.color });
}

export interface SaveAllResult extends SaveResult {
  windows: number;
}

/**
 * Saves every open window into one collection, remembering which window and
 * tab group each tab was in and where each window sat on screen. With
 * `close`, the other windows close and this one is left with a new tab.
 */
export async function saveAllWindows(db: MingTabDB, opts: { spaceId: string; close: boolean }): Promise<SaveAllResult | null> {
  const [current, windows, groups] = await Promise.all([
    chrome.windows.getCurrent(),
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
    chrome.tabGroups.query({}),
  ]);
  const { cards, tabs, session } = snapshotWindows(windows, new Map(groups.map((g) => [g.id, g])), current.id, extensionOrigin());
  if (cards.length === 0) return null;
  const collection = await createCollectionWithCards(db, opts.spaceId, sessionTitle(new Date(), 'All windows'), cards, {
    atTop: true,
    session,
  });
  if (opts.close) await closeTabs(tabs, current.id);
  return { collection, saved: cards.length, windows: session.windows.length };
}

/**
 * Reopens a collection saved from all windows: one new window per saved
 * window, at its old size and place, with its tab groups rebuilt. Returns the
 * number of windows opened.
 */
export async function openSession(cards: Card[], session: SessionLayout): Promise<number> {
  const plan = planRestore(cards, session);
  let focus: number | undefined;
  for (const { window: w, tabs } of plan) {
    const win = (await chrome.windows.create({ ...bounds(w), url: tabs.map((t) => t.url), focused: false }))!;
    // Bounds first, then maximize, so the window maximizes on the screen it was on.
    if (w.state === 'maximized' || w.state === 'fullscreen') await chrome.windows.update(win.id!, { state: 'maximized' });
    const tabIds = (await chrome.tabs.query({ windowId: win.id })).map((t) => t.id!);
    const byGroup = new Map<number, number[]>();
    tabs.forEach((t, i) => {
      if (t.group !== null && tabIds[i] !== undefined) byGroup.set(t.group, [...(byGroup.get(t.group) ?? []), tabIds[i]!]);
    });
    for (const [g, ids] of byGroup) {
      const groupId: number = await chrome.tabs.group({ tabIds: ids as [number, ...number[]], createProperties: { windowId: win.id } });
      const { title, color, collapsed } = session.groups[g]!;
      await chrome.tabGroups.update(groupId, { title, color: color as `${chrome.tabGroups.Color}` });
      // Chrome can refuse to collapse the group holding the active tab; the layout still restores.
      if (collapsed) await chrome.tabGroups.update(groupId, { collapsed }).catch(() => {});
    }
    if (focus === undefined || w.focused) focus = win.id;
  }
  if (focus !== undefined) await chrome.windows.update(focus, { focused: true });
  return plan.length;
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

export async function closeTab(tab: chrome.tabs.Tab) {
  await chrome.tabs.remove(tab.id!);
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
