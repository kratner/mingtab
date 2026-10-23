import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { listAllCardsInOrder, listAllCollectionsInOrder, listSpaces } from '../db/repo';
import { displayTitle } from '../db/schema';
import { chromeFaviconUrl, hostOf } from '../app/favicon';
import { extensionOrigin, focusTab, isSavableUrl } from '../tabs/tabs';
import { buildIndex, matchesTab, search } from './search';

interface Props {
  query: string;
  historyEnabled: boolean;
  onGoTo: (spaceId: string, collectionId?: string) => void;
}

/** Everything that matches the query: saved items, open tabs, and (opt-in) browsing history. */
export function SearchResults({ query, historyEnabled, onGoTo }: Props) {
  const data = useLiveQuery(async () => {
    const [spaces, collections, cards] = await Promise.all([
      listSpaces(db),
      listAllCollectionsInOrder(db),
      listAllCardsInOrder(db),
    ]);
    return { spaces, collections, cards };
  });
  const index = useMemo(() => (data ? buildIndex(data) : null), [data]);
  const results = useMemo(() => (index ? search(index, query) : null), [index, query]);
  const tabs = useOpenTabMatches(query);
  const history = useHistoryMatches(query, historyEnabled);

  if (!index || !results) return null;
  const crumb = (collectionId: string) => {
    const col = index.collectionById.get(collectionId);
    const space = col && index.spaceById.get(col.spaceId);
    return space && col ? `${space.name} › ${col.title}` : '';
  };
  const total = results.spaces.length + results.collections.length + results.cards.length + tabs.length + history.length;

  return (
    <div className="search-results" aria-label="Search results">
      <p className="muted" role="status" aria-label="Result count">
        {total === 0 ? `Nothing matches "${query}".` : `${total} result${total === 1 ? '' : 's'} for "${query}"`}
      </p>

      {results.spaces.length > 0 && (
        <ResultGroup title="Spaces">
          {results.spaces.map((s) => (
            <li key={s.id}>
              <button type="button" className="result" onClick={() => onGoTo(s.id)}>
                <span className="result-title">{s.name}</span>
              </button>
            </li>
          ))}
        </ResultGroup>
      )}

      {results.collections.length > 0 && (
        <ResultGroup title="Collections">
          {results.collections.map((c) => (
            <li key={c.id}>
              <button type="button" className="result" onClick={() => onGoTo(c.spaceId, c.id)}>
                <span className="result-title">{c.title}</span>
                <span className="result-meta">{index.spaceById.get(c.spaceId)?.name}</span>
              </button>
            </li>
          ))}
        </ResultGroup>
      )}

      {results.cards.length > 0 && (
        <ResultGroup title="Saved tabs">
          {results.cards.map((c) => (
            <li key={c.id}>
              <a className="result" href={c.url || undefined} target="_blank" rel="noreferrer" title={c.url}>
                <Icon url={c.url} fallback={c.favIconUrl} />
                <span className="result-text">
                  <span className="result-title">{displayTitle(c)}</span>
                  <span className="result-meta">
                    {crumb(c.collectionId)}
                    {c.url ? ` · ${hostOf(c.url)}` : ''}
                  </span>
                  {c.note && <span className="result-meta">{c.note}</span>}
                </span>
              </a>
            </li>
          ))}
        </ResultGroup>
      )}

      {tabs.length > 0 && (
        <ResultGroup title="Open tabs">
          {tabs.map((t) => (
            <li key={t.id}>
              <button type="button" className="result" onClick={() => focusTab(t)}>
                <Icon url={t.url ?? ''} fallback={t.favIconUrl ?? ''} />
                <span className="result-text">
                  <span className="result-title">{t.title || t.url}</span>
                  <span className="result-meta">{hostOf(t.url ?? '')}</span>
                </span>
              </button>
            </li>
          ))}
        </ResultGroup>
      )}

      {history.length > 0 && (
        <ResultGroup title="History">
          {history.map((h) => (
            <li key={h.id}>
              <a className="result" href={h.url} target="_blank" rel="noreferrer" title={h.url}>
                <Icon url={h.url ?? ''} fallback="" />
                <span className="result-text">
                  <span className="result-title">{h.title || h.url}</span>
                  <span className="result-meta">
                    {hostOf(h.url ?? '')}
                    {h.lastVisitTime ? ` · ${new Date(h.lastVisitTime).toLocaleDateString()}` : ''}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ResultGroup>
      )}
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="result-group" aria-label={title}>
      <h3 className="pane-title">{title}</h3>
      <ul className="result-list">{children}</ul>
    </section>
  );
}

function Icon({ url, fallback }: { url: string; fallback: string }) {
  const sources = [chromeFaviconUrl(url), /^(https?:|data:)/.test(fallback) ? fallback : null].filter((s): s is string => !!s);
  const [i, setI] = useState(0);
  if (i >= sources.length) return <span className="favicon favicon-blank" aria-hidden />;
  return <img className="favicon" src={sources[i]} alt="" onError={() => setI(i + 1)} />;
}

function useOpenTabMatches(query: string) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    let live = true;
    const origin = extensionOrigin();
    chrome.tabs.query({}).then((all) => {
      if (live) setTabs(all.filter((t) => isSavableUrl(t.url, origin) && matchesTab(t, query)).slice(0, 20));
    });
    return () => {
      live = false;
    };
  }, [query]);
  return tabs;
}

/** Only runs when history search is on and the optional "history" permission is granted. */
function useHistoryMatches(query: string, enabled: boolean) {
  const [items, setItems] = useState<chrome.history.HistoryItem[]>([]);
  useEffect(() => {
    if (!enabled || typeof chrome === 'undefined' || !chrome.history) {
      setItems([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const found = await chrome.history.search({ text: query, maxResults: 25, startTime: 0 });
      if (live) setItems(found.filter((h) => matchesTab(h, query)).slice(0, 20));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, enabled]);
  return items;
}
