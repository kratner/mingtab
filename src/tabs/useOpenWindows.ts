import { useEffect, useState } from 'react';

export interface OpenWindow {
  id: number;
  isCurrent: boolean;
  tabs: chrome.tabs.Tab[];
}

export interface OpenTabsState {
  windows: OpenWindow[];
  groups: Map<number, chrome.tabGroups.TabGroup>;
}

/** All normal windows (current first) and tab groups, kept live via tab events. */
export function useOpenWindows(): OpenTabsState | null {
  const [state, setState] = useState<OpenTabsState | null>(null);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.windows) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    const load = async () => {
      const [current, all, groups] = await Promise.all([
        chrome.windows.getCurrent(),
        chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
        chrome.tabGroups.query({}),
      ]);
      if (!alive) return;
      const windows = all
        .map((w) => ({ id: w.id!, isCurrent: w.id === current.id, tabs: w.tabs ?? [] }))
        .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
      setState({ windows, groups: new Map(groups.map((g) => [g.id, g])) });
    };
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 80);
    };

    const events = [
      chrome.tabs.onCreated,
      chrome.tabs.onRemoved,
      chrome.tabs.onUpdated,
      chrome.tabs.onMoved,
      chrome.tabs.onAttached,
      chrome.tabs.onDetached,
      chrome.tabs.onActivated,
      chrome.windows.onCreated,
      chrome.windows.onRemoved,
      chrome.tabGroups.onCreated,
      chrome.tabGroups.onUpdated,
      chrome.tabGroups.onRemoved,
    ] as chrome.events.Event<() => void>[];
    events.forEach((e) => e.addListener(refresh));
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      events.forEach((e) => e.removeListener(refresh));
    };
  }, []);

  return state;
}

/** Splits a window's tabs into runs: ungrouped tabs and tab groups, in tab order. */
export function runsOf(tabs: chrome.tabs.Tab[]): { groupId: number; tabs: chrome.tabs.Tab[] }[] {
  const runs: { groupId: number; tabs: chrome.tabs.Tab[] }[] = [];
  for (const tab of tabs) {
    const gid = tab.groupId ?? -1;
    const last = runs.at(-1);
    if (last && last.groupId === gid) last.tabs.push(tab);
    else runs.push({ groupId: gid, tabs: [tab] });
  }
  return runs;
}
