import type { MingTabDB } from './db/db';
import { findByShortcut, suggestShortcuts } from './db/shortcuts';

// "to" in Chrome's address bar: "to docs" opens the card whose shortcut is
// "docs". Suggestions list matching shortcuts, then matching card titles.
// Anything else opens MingTab with a search for what was typed.

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos' }[c]};`);

export async function omniboxSuggestions(db: MingTabDB, text: string): Promise<chrome.omnibox.SuggestResult[]> {
  return (await suggestShortcuts(db, text)).map((s) => ({
    content: s.shortcut ?? s.url,
    description: s.shortcut
      ? `<match>to/${xml(s.shortcut)}</match> <dim>${xml(s.title)}</dim>`
      : `${xml(s.title)} <url>${xml(s.url)}</url>`,
  }));
}

/** Where "to <text>" should go: a shortcut's page, a URL picked from the suggestions, or a MingTab search. */
export async function resolveOmnibox(db: MingTabDB, text: string, boardUrl: string): Promise<string> {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) return t;
  const card = await findByShortcut(db, t);
  if (card) return card.url;
  return `${boardUrl}#search=${encodeURIComponent(t)}`;
}
