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
import { downloadJson, readJsonFile, timestamp } from './files';
import type { Theme } from './prefs';

interface Props {
  theme: Theme;
  onTheme: (t: Theme) => void;
  hasData: boolean;
  onDone: () => void;
}

export function Settings({ theme, onTheme, hasData, onDone }: Props) {
  return (
    <div className="settings">
      <div className="space-toolbar">
        <h2>Settings</h2>
        <button type="button" onClick={onDone}>
          Back to board
        </button>
      </div>

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
      </section>

      <TobyImport hasData={hasData} onImported={onDone} />
      <Backup />
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
