import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { createSpace, listSpaces } from '../db/repo';
import { applyTheme, usePref, type Theme } from './prefs';
import { Settings } from './Settings';
import { SpaceNav } from './SpaceNav';
import { SpaceView } from './SpaceView';
import type { Surface } from './surface';

export function App({ surface }: { surface: Surface }) {
  const spaces = useLiveQuery(() => listSpaces(db));
  const [selectedId, setSelectedId] = usePref<string>('mingtab.space', '');
  const [theme, setTheme] = usePref<Theme>('mingtab.theme', 'system');
  const [view, setView] = useState<'board' | 'settings'>('board');

  useEffect(() => applyTheme(theme), [theme]);

  // Keep a valid selection when spaces are added or deleted.
  const selected = spaces?.find((s) => s.id === selectedId) ?? spaces?.[0];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId, setSelectedId]);

  if (!spaces) return null;

  return (
    <div className="app" data-surface={surface}>
      <header className="app-header">
        <h1>MingTab</h1>
        <span className="surface-tag">{surface === 'newtab' ? 'Board' : 'Side panel'}</span>
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
          <Settings theme={theme} onTheme={setTheme} hasData={spaces.length > 0} onDone={() => setView('board')} />
        </main>
      ) : spaces.length === 0 ? (
        <main className="app-main">
          <div className="welcome">
            <p className="empty">Your bright hall is clear. Saved collections will appear here.</p>
            <div className="row">
              <button type="button" className="primary" onClick={async () => setSelectedId((await createSpace(db, 'My Collections')).id)}>
                Create a space
              </button>
              <button type="button" onClick={() => setView('settings')}>
                Import from Toby
              </button>
            </div>
          </div>
        </main>
      ) : (
        <div className="layout">
          <SpaceNav surface={surface} spaces={spaces} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <main className="app-main">{selected && <SpaceView key={selected.id} space={selected} />}</main>
        </div>
      )}
    </div>
  );
}
