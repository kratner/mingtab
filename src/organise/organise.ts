import { hostOf } from '../app/favicon';
import type { Card, Collection } from '../db/schema';

// Sorting and grouping collections in a space (the Sort and Group menus).
// Pure functions: the board passes in live records and per-collection tab counts.

export type SortMode = 'custom' | 'az' | 'za' | 'newest' | 'oldest' | 'most' | 'fewest' | 'recent' | 'stale';
export type GroupMode = 'none' | 'year' | 'site';

export const SORTS: { id: SortMode; label: string }[] = [
  { id: 'custom', label: 'Custom order' },
  { id: 'az', label: 'Name A–Z' },
  { id: 'za', label: 'Name Z–A' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'most', label: 'Most tabs' },
  { id: 'fewest', label: 'Fewest tabs' },
  { id: 'recent', label: 'Recently opened' },
  { id: 'stale', label: 'Not opened lately' },
];

export const GROUPS: { id: GroupMode; label: string }[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'year', label: 'By year saved' },
  { id: 'site', label: 'By site' },
];

const SORT_IDS = new Set(SORTS.map((s) => s.id));
const GROUP_IDS = new Set(GROUPS.map((g) => g.id));
/** A saved preference from another version may not exist here; fall back to the default. */
export const asSort = (v: string): SortMode => (SORT_IDS.has(v as SortMode) ? (v as SortMode) : 'custom');
export const asGroup = (v: string): GroupMode => (GROUP_IDS.has(v as GroupMode) ? (v as GroupMode) : 'none');

const byName = (a: Collection, b: Collection) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
const opened = (c: Collection) => c.lastOpenedAt ?? 0;

/** `cols` arrive in custom (position) order; ties keep that order (Array.sort is stable). */
export function sortCollections(cols: Collection[], sort: SortMode, tabs: ReadonlyMap<string, number> = new Map()): Collection[] {
  const n = (c: Collection) => tabs.get(c.id) ?? 0;
  const cmp: ((a: Collection, b: Collection) => number) | null = {
    custom: null,
    az: byName,
    za: (a: Collection, b: Collection) => byName(b, a),
    newest: (a: Collection, b: Collection) => b.createdAt - a.createdAt,
    oldest: (a: Collection, b: Collection) => a.createdAt - b.createdAt,
    most: (a: Collection, b: Collection) => n(b) - n(a),
    fewest: (a: Collection, b: Collection) => n(a) - n(b),
    // Never opened goes last; among those, newest saved first.
    recent: (a: Collection, b: Collection) => opened(b) - opened(a) || b.createdAt - a.createdAt,
    // Never opened comes first, oldest saved first: the likeliest to clear out.
    stale: (a: Collection, b: Collection) => opened(a) - opened(b) || a.createdAt - b.createdAt,
  }[sort];
  return cmp ? [...cols].sort(cmp) : cols;
}

export interface YearGroup {
  year: number;
  collections: Collection[];
}

/** Newest year first; collections keep the order they arrive in (the chosen sort). */
export function groupByYear(cols: Collection[]): YearGroup[] {
  const years = new Map<number, Collection[]>();
  for (const c of cols) {
    const y = new Date(c.createdAt).getFullYear();
    years.set(y, [...(years.get(y) ?? []), c]);
  }
  return [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, collections]) => ({ year, collections }));
}

export interface SiteGroup {
  host: string;
  cards: Card[];
}

/**
 * Every saved page in the given collections, gathered by website: most tabs first, then A–Z.
 * Cards arrive in board order and keep it within a site. Notes (no URL) are left out.
 */
export function groupBySite(cards: Card[]): SiteGroup[] {
  const sites = new Map<string, Card[]>();
  for (const c of cards) {
    if (!c.url) continue;
    const host = hostOf(c.url) || c.url.split(':')[0] || 'other';
    sites.set(host, [...(sites.get(host) ?? []), c]);
  }
  return [...sites.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([host, cards]) => ({ host, cards }));
}

const DAY = 86_400_000;
const YEAR = 365 * DAY;

/** Saved over a year ago and not opened (from MingTab) in the past year. */
export function isStale(c: Collection, now = Date.now()): boolean {
  return now - c.createdAt > YEAR && now - opened(c) > YEAR;
}

export function ago(t: number | null | undefined, now = Date.now()): string {
  if (!t) return 'never opened';
  const d = Math.floor((now - t) / DAY);
  if (d < 1) return 'opened today';
  if (d === 1) return 'opened yesterday';
  if (d < 30) return `opened ${d} days ago`;
  const m = Math.floor(d / 30.44);
  if (m < 12) return `opened ${m} month${m === 1 ? '' : 's'} ago`;
  const y = Math.floor(d / 365);
  return `opened ${y} year${y === 1 ? '' : 's'} ago`;
}

export const monthYear = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** "Saved Mar 2021 · opened 3 days ago" under a collection's title. */
export const collectionMeta = (c: Collection, now = Date.now()) => `Saved ${monthYear(c.createdAt)} · ${ago(c.lastOpenedAt, now)}`;
