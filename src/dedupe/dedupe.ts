import type { Card } from '../db/schema';

// Tracking parameters that don't change which page a URL points at.
const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|ref_src|igshid)$/i;

/**
 * Canonical form for duplicate detection: lowercase scheme and host, no
 * "www.", no #fragment, no trailing slash, no tracking parameters, remaining
 * parameters sorted. Unparseable URLs compare as trimmed text.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.protocol.toLowerCase()}//${host}${path}${query}`;
  } catch {
    return url.trim();
  }
}

export interface DuplicateGroup {
  key: string;
  /** In the order given; the first is the copy to keep by default. */
  cards: Card[];
}

/** Groups cards (given in board order) that point at the same page. Note cards (no URL) are ignored. */
export function findDuplicates(cardsInOrder: Card[], normalize = true): DuplicateGroup[] {
  const groups = new Map<string, Card[]>();
  for (const c of cardsInOrder) {
    if (!c.url) continue;
    const key = normalize ? normalizeUrl(c.url) : c.url;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()].filter(([, cs]) => cs.length > 1).map(([key, cards]) => ({ key, cards }));
}

/** How many cards would go if every group kept only its first copy. */
export const extraCopies = (groups: DuplicateGroup[]) => groups.reduce((n, g) => n + g.cards.length - 1, 0);
