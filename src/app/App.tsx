import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { createSpace, listSpaces } from '../db/repo';
import { DndProvider } from '../dnd/DndProvider';
import { SearchResults } from '../search/SearchResults';
import { requestSync } from '../sync/state';
import { OpenTabs } from '../tabs/OpenTabs';
import { UpdateBanner } from '../update/UpdateBanner';
import { applyTheme, usePref, type Density, type Scheme, type SortMode, type Theme } from './prefs';
import { Settings } from './Settings';
import { NextView } from './NextView';
import { NEXT, SpaceNav, STARRED } from './SpaceNav';
import { SpaceView, StarredView } from './SpaceView';
import type { Surface } from './surface';

export function App({ surface }: { surface: Surface }) {
  const allSpaces = useLiveQuery(() => listSpaces(db));
  // Spaces hidden on this device (Settings → Spaces on this device). They still sync.
  const [hiddenJson, setHiddenJson] = usePref<string>('mingtab.hiddenSpaces', '[]');
  const hiddenSpaces = parseIds(hiddenJson);
  const spaces = allSpaces?.filter((s) => !hiddenSpaces.includes(s.id));
  const [selectedId, setSelectedId] = usePref<string>('mingtab.space', '');
  const [theme, setTheme] = usePref<Theme>('mingtab.theme', 'system');
  const [savedScheme, setScheme] = usePref<Scheme>('mingtab.scheme', 'four-ounces');
  const scheme: Scheme = savedScheme === 'terracotta' ? 'terracotta' : 'four-ounces';
  const [closeOnSave, setCloseOnSave] = usePref<'true' | 'false'>('mingtab.closeOnSave', 'true');
  const [sort, setSort] = usePref<SortMode>('mingtab.sort', 'custom');
  const [density, setDensity] = usePref<Density>('mingtab.density', 'comfortable');
  const [historySearch, setHistorySearch] = usePref<'on' | 'off'>('mingtab.historySearch', 'off');
  const [view, setView] = useState<'board' | 'settings'>('board');
  // Board below 1100px: open-tabs pane is a drawer.
  const [paneOpen, setPaneOpen] = useState(false);
  // The side panel is narrow, so it shows saved collections or open tabs, not both.
  const [pane, setPane] = usePref<'saved' | 'open'>('mingtab.sidepanelPane', 'saved');
  // "to <words>" with no matching shortcut lands here with #search=<words>.
  const [query, setQuery] = useState(() => {
    const m = /^#search=(.*)$/.exec(location.hash);
    return m ? decodeURIComponent(m[1]!) : '';
  });
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => applyTheme(theme, scheme), [theme, scheme]);

  // A local edit asks the background worker to sync in a couple of seconds.
  useEffect(() => {
    const onChange = () => void requestSync('soon');
    Dexie.on('storagemutated', onChange);
    return () => Dexie.on('storagemutated').unsubscribe(onChange);
  }, []);

  // A "to …" with no matching shortcut opens MingTab at #search=<words>; also
  // handle that when this page is already open (only the hash changes).
  useEffect(() => {
    const onHash = () => {
      const m = /^#search=(.*)$/.exec(location.hash);
      if (m) {
        setView('board');
        setQuery(decodeURIComponent(m[1]!));
      }
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // "/" jumps to search from anywhere that isn't a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setView('board');
      searchRef.current?.focus();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // Keep a valid selection when spaces are added or deleted.
  const starred = selectedId === STARRED;
  const next = selectedId === NEXT;
  const pseudo = starred || next;
  const selected = pseudo ? undefined : (spaces?.find((s) => s.id === selectedId) ?? spaces?.[0]);
  useEffect(() => {
    if (!pseudo && selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [pseudo, selected, selectedId, setSelectedId]);

  if (!spaces) return null;
  const searching = query.trim().length > 0 && view === 'board';
  const showSaved = surface === 'newtab' || pane === 'saved' || searching;
  const showOpen = surface === 'newtab' || (pane === 'open' && !searching);

  const goTo = (spaceId: string, collectionId?: string) => {
    setSelectedId(spaceId);
    setQuery('');
    setPane('saved');
    setHighlightId(collectionId ?? null);
  };

  return (
    <div
      className="app"
      data-surface={surface}
      data-popup={new URLSearchParams(location.search).has('popup') || undefined}
      data-pane-open={paneOpen}
      data-density={density}
    >
      <header className="app-header">
        <img className="brand-mark" src="/brand/ming-glyph.svg" alt="" title="MingTab: from 明堂 míngtáng, the bright hall" />
        <h1>MingTab</h1>
        <span className="surface-tag">{surface === 'newtab' ? 'Board' : 'Side panel'}</span>
        <input
          ref={searchRef}
          className="search-box"
          type="search"
          aria-label="Search"
          placeholder="Search everything  /"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setView('board');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('');
              e.currentTarget.blur();
            }
          }}
        />
        {surface === 'newtab' && view === 'board' && (
          <button
            type="button"
            className="small pane-toggle"
            aria-expanded={paneOpen}
            onClick={() => setPaneOpen(!paneOpen)}
          >
            Open tabs
          </button>
        )}
        <button
          type="button"
          className="icon-btn header-settings"
          aria-label={view === 'settings' ? 'Close settings' : 'Settings'}
          title={view === 'settings' ? 'Close settings' : 'Settings'}
          aria-pressed={view === 'settings'}
          onClick={() => setView(view === 'settings' ? 'board' : 'settings')}
        >
          ⚙
        </button>
      </header>
      <UpdateBanner />

      {view === 'settings' ? (
        <main className="app-main">
          <Settings
            theme={theme}
            onTheme={setTheme}
            scheme={scheme}
            onScheme={setScheme}
            closeOnSave={closeOnSave === 'true'}
            onCloseOnSave={(v) => setCloseOnSave(v ? 'true' : 'false')}
            historySearch={historySearch === 'on'}
            onHistorySearch={(v) => setHistorySearch(v ? 'on' : 'off')}
            hiddenSpaces={hiddenSpaces}
            onHiddenSpaces={(ids) => setHiddenJson(JSON.stringify(ids))}
            hasData={spaces.length > 0}
            onDone={() => setView('board')}
          />
        </main>
      ) : (
        <>
          {surface === 'sidepanel' && !searching && (
            <div className="pane-switch" role="tablist" aria-label="Side panel view">
              {(['saved', 'open'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={pane === p}
                  className={pane === p ? 'active' : ''}
                  onClick={() => setPane(p)}
                >
                  {p === 'saved' ? 'Saved' : 'Open tabs'}
                </button>
              ))}
            </div>
          )}
          <DndProvider>
            <div className="layout">
              {showSaved && !searching && spaces.length > 0 && (
                <SpaceNav
                  surface={surface}
                  spaces={spaces}
                  selectedId={pseudo ? selectedId : (selected?.id ?? null)}
                  onSelect={setSelectedId}
                />
              )}
              {showSaved && (
                <main className="app-main">
                  {searching ? (
                    <SearchResults query={query} historyEnabled={historySearch === 'on'} onGoTo={goTo} />
                  ) : next ? (
                    <NextView />
                  ) : starred ? (
                    <StarredView onGoTo={goTo} />
                  ) : selected ? (
                    <SpaceView
                      key={selected.id}
                      space={selected}
                      sort={sort}
                      onSort={setSort}
                      density={density}
                      onDensity={setDensity}
                      highlightId={highlightId}
                      onHighlightDone={() => setHighlightId(null)}
                    />
                  ) : (
                    <div className="welcome">
                      <img className="welcome-logo" src="/brand/ming-doorway.svg" alt="" />
                      <p className="empty">
                        Your bright hall is clear. Saved collections will appear here.{' '}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setView('settings');
                            setTimeout(() => document.getElementById('about')?.scrollIntoView({ block: 'start' }), 50);
                          }}
                        >
                          Why "bright hall"?
                        </button>
                      </p>
                      <div className="row">
                        <button
                          type="button"
                          className="primary"
                          onClick={async () => setSelectedId((await createSpace(db, 'My Collections')).id)}
                        >
                          Create a space
                        </button>
                        <button type="button" onClick={() => setView('settings')}>
                          Import from Toby, restore a backup, or sign in to sync
                        </button>
                      </div>
                    </div>
                  )}
                </main>
              )}
              {showOpen && (
                <OpenTabs
                  spaceId={selected?.id ?? spaces[0]?.id ?? null}
                  onSpaceCreated={setSelectedId}
                  closeOnSave={closeOnSave === 'true'}
                />
              )}
            </div>
          </DndProvider>
        </>
      )}
    </div>
  );
}

function parseIds(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
