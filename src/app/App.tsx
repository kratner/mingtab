import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { createSpace, listSpaces } from '../db/repo';
import { applyTheme, usePref, type Scheme, type Theme } from './prefs';
import { Settings } from './Settings';
import { SpaceNav } from './SpaceNav';
import { SpaceView } from './SpaceView';
import { OpenTabs } from '../tabs/OpenTabs';
import { DndProvider } from '../dnd/DndProvider';
import type { Surface } from './surface';

export function App({ surface }: { surface: Surface }) {
  const spaces = useLiveQuery(() => listSpaces(db));
  const [selectedId, setSelectedId] = usePref<string>('mingtab.space', '');
  const [theme, setTheme] = usePref<Theme>('mingtab.theme', 'system');
  const [scheme, setScheme] = usePref<Scheme>('mingtab.scheme', 'kr');
  const [closeOnSave, setCloseOnSave] = usePref<'true' | 'false'>('mingtab.closeOnSave', 'true');
  const [view, setView] = useState<'board' | 'settings'>('board');
  // Board below 1100px: open-tabs pane is a drawer.
  const [paneOpen, setPaneOpen] = useState(false);
  // The side panel is narrow, so it shows saved collections or open tabs, not both.
  const [pane, setPane] = usePref<'saved' | 'open'>('mingtab.sidepanelPane', 'saved');

  useEffect(() => applyTheme(theme, scheme), [theme, scheme]);

  // Keep a valid selection when spaces are added or deleted.
  const selected = spaces?.find((s) => s.id === selectedId) ?? spaces?.[0];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId, setSelectedId]);

  if (!spaces) return null;
  const showSaved = surface === 'newtab' || pane === 'saved';
  const showOpen = surface === 'newtab' || pane === 'open';

  return (
    <div className="app" data-surface={surface} data-pane-open={paneOpen}>
      <header className="app-header">
        <img className="brand-mark" src="/icons/icon-32.png" alt="" />
        <h1>MingTab</h1>
        <span className="surface-tag">{surface === 'newtab' ? 'Board' : 'Side panel'}</span>
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
          aria-pressed={view === 'settings'}
          onClick={() => setView(view === 'settings' ? 'board' : 'settings')}
        >
          ⚙
        </button>
      </header>

      {view === 'settings' ? (
        <main className="app-main">
          <Settings
            theme={theme}
            onTheme={setTheme}
            scheme={scheme}
            onScheme={setScheme}
            closeOnSave={closeOnSave === 'true'}
            onCloseOnSave={(v) => setCloseOnSave(v ? 'true' : 'false')}
            hasData={spaces.length > 0}
            onDone={() => setView('board')}
          />
        </main>
      ) : (
        <>
          {surface === 'sidepanel' && (
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
            {showSaved && spaces.length > 0 && (
              <SpaceNav surface={surface} spaces={spaces} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            )}
            {showSaved && (
              <main className="app-main">
                {selected ? (
                  <SpaceView key={selected.id} space={selected} />
                ) : (
                  <div className="welcome">
                    <p className="empty">Your bright hall is clear. Saved collections will appear here.</p>
                    <div className="row">
                      <button
                        type="button"
                        className="primary"
                        onClick={async () => setSelectedId((await createSpace(db, 'My Collections')).id)}
                      >
                        Create a space
                      </button>
                      <button type="button" onClick={() => setView('settings')}>
                        Import from Toby
                      </button>
                    </div>
                  </div>
                )}
              </main>
            )}
            {showOpen && (
              <OpenTabs spaceId={selected?.id ?? null} onSpaceCreated={setSelectedId} closeOnSave={closeOnSave === 'true'} />
            )}
          </div>
          </DndProvider>
        </>
      )}
    </div>
  );
}
