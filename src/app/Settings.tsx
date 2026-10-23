import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { exportAll, parseMingTabExport, restoreAll } from '../import/mingtab';
import {
  applyImport,
  parseSpaceMap,
  parseTobyExport,
  planTobyImport,
  type ImportPlan,
  type TobyExport,
  type TobySpaceMap,
} from '../import/toby';
import { deleteCards, listAllCardsInOrder, listAllCollectionsInOrder, listSpaces } from '../db/repo';
import { displayTitle } from '../db/schema';
import { findDuplicates, type DuplicateGroup } from '../dedupe/dedupe';
import { downloadJson, readJsonFile, timestamp } from './files';
import { SyncSettings } from '../sync/SyncSettings';
import type { Scheme, Theme } from './prefs';

interface Props {
  theme: Theme;
  onTheme: (t: Theme) => void;
  scheme: Scheme;
  onScheme: (s: Scheme) => void;
  closeOnSave: boolean;
  onCloseOnSave: (v: boolean) => void;
  historySearch: boolean;
  onHistorySearch: (v: boolean) => void;
  hiddenSpaces: string[];
  onHiddenSpaces: (ids: string[]) => void;
  hasData: boolean;
  onDone: () => void;
}

const SCHEMES: { id: Scheme; label: string }[] = [
  { id: 'kr', label: 'KR (black and yellow)' },
  { id: 'terracotta', label: 'Terracotta' },
];

export function Settings({
  theme,
  onTheme,
  scheme,
  onScheme,
  closeOnSave,
  onCloseOnSave,
  historySearch,
  onHistorySearch,
  hiddenSpaces,
  onHiddenSpaces,
  hasData,
  onDone,
}: Props) {
  return (
    <div className="settings">
      <div className="space-toolbar">
        <h2>Settings</h2>
        <button type="button" onClick={onDone}>
          Back to board
        </button>
      </div>

      <SyncSettings hiddenSpaces={hiddenSpaces} onHiddenSpaces={onHiddenSpaces} />

      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <label key={t}>
              <input type="radio" name="theme" checked={theme === t} onChange={() => onTheme(t)} />
              {t[0]!.toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Color scheme">
          {SCHEMES.map((s) => (
            <label key={s.id}>
              <input type="radio" name="scheme" checked={scheme === s.id} onChange={() => onScheme(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
      </section>

      <ToolbarButton />
      <Shortcuts />

      <section className="settings-section">
        <h3>Saving tabs</h3>
        <label className="check">
          <input type="checkbox" checked={closeOnSave} onChange={(e) => onCloseOnSave(e.target.checked)} />
          Close tabs after saving a window or tab group
        </label>
        <p className="muted">Pinned tabs are never saved with a window or closed.</p>
      </section>

      <section className="settings-section">
        <h3>Search</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={historySearch}
            onChange={async (e) => {
              if (!e.target.checked) return onHistorySearch(false);
              // Chrome shows its own prompt; only turn on if it's granted.
              const granted = await chrome.permissions.request({ permissions: ['history'] }).catch(() => false);
              onHistorySearch(granted);
            }}
          />
          Include browsing history in search results
        </label>
        <p className="muted">Chrome asks for permission the first time. History stays in Chrome; MingTab only reads it while you search.</p>
      </section>

      <Duplicates />

      <TobyImport hasData={hasData} onImported={onDone} />
      <Backup />
      <About />
    </div>
  );
}

function TobyImport({ hasData, onImported }: { hasData: boolean; onImported: () => void }) {
  const [data, setData] = useState<TobyExport | null>(null);
  const [map, setMap] = useState<TobySpaceMap | null>(null);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // Recompute the preview from current inputs; the latest run wins, so picking
  // both files in quick succession can't leave a stale preview.
  useEffect(() => {
    let current = true;
    if (!data) {
      setPlan(null);
      return;
    }
    planTobyImport(data, map, { skipEmpty }).then((p) => current && setPlan(p));
    return () => {
      current = false;
    };
  }, [data, map, skipEmpty]);

  const pick = async (file: File | undefined, kind: 'export' | 'map') => {
    setError('');
    setStatus('');
    if (!file) return;
    try {
      const raw = await readJsonFile(file);
      if (kind === 'export') setData(parseTobyExport(raw));
      else setMap(parseSpaceMap(raw));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const run = async () => {
    if (!plan) return;
    if (mode === 'replace' && !confirm('Replace everything in MingTab with this import?')) return;
    await applyImport(db, plan, hasData ? mode : 'add');
    const r = plan.report.toImport;
    setStatus(`Imported ${r.collections} collections and ${r.cards} cards into ${r.spaces} spaces.`);
    onImported();
  };

  const r = plan?.report;
  return (
    <section className="settings-section" aria-labelledby="toby-import">
      <h3 id="toby-import">Import from Toby</h3>
      <p className="muted">
        In Toby, open Settings → Export and choose <b>.JSON</b>. Toby's export has no spaces; to keep them, also add a
        space map from <code>scripts/toby-space-map.js</code>. Without one, everything lands in one space.
      </p>
      <label className="file">
        Toby export (.json)
        <input type="file" accept=".json,application/json" onChange={(e) => pick(e.target.files?.[0], 'export')} />
      </label>
      <label className="file">
        Space map (optional)
        <input type="file" accept=".json,application/json" onChange={(e) => pick(e.target.files?.[0], 'map')} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {r && (
        <div className="import-preview" aria-label="Import preview">
          <p>
            Export has <b data-testid="in-collections">{r.inExport.collections}</b> collections and{' '}
            <b data-testid="in-cards">{r.inExport.cards}</b> cards. Will import{' '}
            <b data-testid="out-collections">{r.toImport.collections}</b> collections and{' '}
            <b data-testid="out-cards">{r.toImport.cards}</b> cards into{' '}
            <b data-testid="out-spaces">{r.toImport.spaces}</b> spaces.
          </p>
          <ul className="report-spaces">
            {r.bySpace.map((s) => (
              <li key={s.name}>
                {s.name}: {s.collections} collections, {s.cards} cards
              </li>
            ))}
          </ul>
          {r.unmatchedCollections > 0 && (
            <p className="warn">
              {r.unmatchedCollections} collections weren't in the space map and go to "Imported from Toby".
            </p>
          )}
          {r.noteCardsWithoutText > 0 && (
            <p className="muted">
              {r.noteCardsWithoutText} Toby note cards come across as titles only; Toby doesn't export note text.
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={skipEmpty}
              onChange={(e) => setSkipEmpty(e.target.checked)}
            />
            Skip empty collections{r.skippedEmptyCollections ? ` (${r.skippedEmptyCollections} skipped)` : ''}
          </label>
          {hasData && (
            <div className="segmented" role="radiogroup" aria-label="Import mode">
              <label>
                <input type="radio" name="mode" checked={mode === 'add'} onChange={() => setMode('add')} />
                Add to what's here
              </label>
              <label>
                <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                Replace everything
              </label>
            </div>
          )}
          <button type="button" className="primary" onClick={run}>
            Import
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}

function Duplicates() {
  const [groups, setGroups] = useState<(DuplicateGroup & { where: string[] })[] | null>(null);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');

  const find = async () => {
    setStatus('');
    const [cards, cols, spaces] = await Promise.all([listAllCardsInOrder(db), listAllCollectionsInOrder(db), listSpaces(db)]);
    const colById = new Map(cols.map((c) => [c.id, c]));
    const spaceById = new Map(spaces.map((s) => [s.id, s.name]));
    const found = findDuplicates(cards).map((g) => ({
      ...g,
      where: g.cards.map((c) => {
        const col = colById.get(c.collectionId);
        return col ? `${spaceById.get(col.spaceId)} › ${col.title}` : '';
      }),
    }));
    setGroups(found);
    // Default: keep the first copy (earliest on the board), remove the rest.
    setRemove(new Set(found.flatMap((g) => g.cards.slice(1).map((c) => c.id))));
  };

  const run = async () => {
    if (remove.size === 0) return;
    if (!confirm(`Remove ${remove.size} duplicate card${remove.size === 1 ? '' : 's'}? Download a backup first if you might want them back.`)) return;
    await deleteCards(db, [...remove]);
    setStatus(`Removed ${remove.size} duplicate card${remove.size === 1 ? '' : 's'}.`);
    setGroups(null);
    setRemove(new Set());
  };

  const toggle = (id: string, on: boolean) => {
    const next = new Set(remove);
    if (on) next.add(id);
    else next.delete(id);
    setRemove(next);
  };

  return (
    <section className="settings-section" aria-labelledby="dupes">
      <h3 id="dupes">Duplicates</h3>
      <p className="muted">
        Finds cards that point at the same page, ignoring "www.", #anchors, trailing slashes and tracking parameters.
        Nothing is removed until you confirm.
      </p>
      <button type="button" onClick={find}>
        Find duplicates
      </button>
      {groups && (
        <div className="dupes">
          <p role="status" aria-label="Duplicates found">
            {groups.length === 0
              ? 'No duplicates.'
              : `${groups.length} page${groups.length === 1 ? '' : 's'} saved more than once; ${remove.size} card${remove.size === 1 ? '' : 's'} selected for removal.`}
          </p>
          {groups.length > 0 && (
            <>
              <ul className="dupe-groups">
                {groups.map((g) => (
                  <li key={g.key}>
                    <div className="dupe-title" title={g.key}>
                      {displayTitle(g.cards[0]!)}
                    </div>
                    {g.cards.map((c, i) => (
                      <label key={c.id} className="check">
                        <input
                          type="checkbox"
                          aria-label={`Remove copy ${i + 1} of ${displayTitle(c)} in ${g.where[i]}`}
                          checked={remove.has(c.id)}
                          onChange={(e) => toggle(c.id, e.target.checked)}
                        />
                        <span className="muted">{g.where[i]}</span>
                        {i === 0 && !remove.has(c.id) && <span className="badge">kept</span>}
                      </label>
                    ))}
                  </li>
                ))}
              </ul>
              <button type="button" className="primary" disabled={remove.size === 0} onClick={run}>
                Remove {remove.size} selected
              </button>
            </>
          )}
        </div>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}

function Backup() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const restore = async (file: File | undefined) => {
    setError('');
    setStatus('');
    if (!file) return;
    try {
      const data = parseMingTabExport(await readJsonFile(file));
      if (!confirm(`Replace everything in MingTab with the backup from ${data.exportedAt}?`)) return;
      await restoreAll(db, data);
      setStatus(`Restored ${data.collections.length} collections and ${data.cards.length} cards.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="settings-section">
      <h3>Backup</h3>
      <p className="muted">A MingTab backup holds everything. Restoring one replaces what's here.</p>
      <div className="row">
        <button type="button" onClick={async () => downloadJson(`mingtab-backup-${timestamp()}.json`, await exportAll(db))}>
          Download backup
        </button>
        <label className="file">
          Restore from backup
          <input type="file" accept=".json,application/json" onChange={(e) => restore(e.target.files?.[0])} />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}

/** The name, briefly. Also linked from the welcome screen. */
export function About() {
  const version = typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : '';
  return (
    <section className="settings-section about" id="about" aria-labelledby="about-heading">
      <img className="about-logo" src="/brand/ming-doorway.svg" alt="明 in a bright doorway, the MingTab logo" />
      <div>
        <h3 id="about-heading">About MingTab</h3>
        <p>
          <b lang="zh">明堂</b> <i>míngtáng</i>, "the bright hall", is the open, uncluttered space in front of a building in
          feng shui: the place where qi, the energy of a place, gathers before it flows inside. Clutter there blocks it; a
          clear approach lets it in.
        </p>
        <p>
          <b lang="zh">明</b> <i>míng</i>, "bright", joins <span lang="zh">日</span> (sun) and <span lang="zh">月</span>{' '}
          (moon).
        </p>
        <p>
          Forty open tabs are a cluttered approach. MingTab keeps yours clear: put away what you aren't using, and find it
          again when you need it.
        </p>
        {version && <p className="muted">Version {version}</p>}
      </div>
    </section>
  );
}

/** Whether the toolbar button opens the side panel or a popup (applied by the background worker). */
function ToolbarButton() {
  const [mode, setMode] = useState<'panel' | 'popup' | null>(null);
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get('mingtab.actionMode').then((v) => setMode((v['mingtab.actionMode'] as 'panel' | 'popup') ?? 'panel'));
  }, []);
  if (!mode) return null;
  const pick = (m: 'panel' | 'popup') => {
    setMode(m);
    void chrome.storage.local.set({ 'mingtab.actionMode': m });
  };
  return (
    <section className="settings-section">
      <h3>Toolbar button</h3>
      <div className="segmented" role="radiogroup" aria-label="Toolbar button opens">
        <label>
          <input type="radio" name="action" checked={mode === 'panel'} onChange={() => pick('panel')} />
          Opens the side panel
        </label>
        <label>
          <input type="radio" name="action" checked={mode === 'popup'} onChange={() => pick('popup')} />
          Opens a popup
        </label>
      </div>
    </section>
  );
}

/** Every to/ shortcut, so they're easy to remember. Set them in a card's edit form. */
function Shortcuts() {
  const cards = useLiveQuery(() => db.cards.filter((c) => c.deletedAt === null && !!c.shortcut).toArray());
  return (
    <section className="settings-section" aria-labelledby="shortcuts-heading">
      <h3 id="shortcuts-heading">Address-bar shortcuts</h3>
      <p className="muted">
        Type <b>to/</b> in Chrome's address bar, press Space, then a shortcut to open that card: <code>to/ docs</code>.
        Give a card a shortcut from its edit form (✎). If Toby is also installed it owns <b>to/</b> too: turn Toby off
        in chrome://extensions.
      </p>
      {cards && cards.length > 0 && (
        <ul className="shortcut-list">
          {[...cards]
            .sort((a, b) => a.shortcut!.localeCompare(b.shortcut!))
            .map((c) => (
              <li key={c.id}>
                <code>to/{c.shortcut}</code> <span className="muted">{displayTitle(c)}</span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
