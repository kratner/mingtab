import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Space } from '../db/schema';
import { loadStats } from './stats';

interface Props {
  spaces: Space[];
  /** Spaces hidden on this device; they aren't counted. */
  hiddenCount: number;
  onGoTo: (spaceId: string, collectionId?: string) => void;
  onFindDuplicates: () => void;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** Counts across every space shown on this device. */
export function StatsView({ spaces, hiddenCount, onGoTo, onFindDuplicates }: Props) {
  const s = useLiveQuery(() => loadStats(db, spaces, 10), [spaces.map((x) => x.id).join()]);
  if (!s) return null;
  const tile = (value: number, label: string) => (
    <div className="stat-tile">
      <span className="stat-value">{value.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
  return (
    <div className="space-view stats-view">
      <div className="space-toolbar">
        <h2>Stats</h2>
        <span className="muted">
          All spaces{hiddenCount > 0 && ` on this device (${plural(hiddenCount, 'hidden space')} not counted)`}
        </span>
      </div>
      <div className="stat-tiles" role="list" aria-label="Totals">
        {[
          tile(s.spaces, s.spaces === 1 ? 'space' : 'spaces'),
          tile(s.collections, s.collections === 1 ? 'collection' : 'collections'),
          tile(s.tabs, s.tabs === 1 ? 'saved tab' : 'saved tabs'),
          tile(s.notes, s.notes === 1 ? 'note' : 'notes'),
          tile(s.tabsWithNotes, 'tabs with a note'),
          tile(s.emptyCollections, s.emptyCollections === 1 ? 'empty collection' : 'empty collections'),
        ].map((t, i) => (
          <div role="listitem" key={i}>
            {t}
          </div>
        ))}
        <div role="listitem">
          <div className="stat-tile">
            <span className="stat-value">{s.duplicates.toLocaleString()}</span>
            <span className="stat-label">{s.duplicates === 1 ? 'duplicate tab' : 'duplicate tabs'}</span>
            {s.duplicates > 0 && (
              <button type="button" className="link-btn" onClick={onFindDuplicates}>
                Review duplicates
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="stat-panels">
        <section className="stat-panel" aria-labelledby="stat-biggest">
          <h3 id="stat-biggest">Biggest collections</h3>
          {s.biggest.length === 0 ? (
            <p className="empty">No saved tabs yet.</p>
          ) : (
            <ol>
              {s.biggest.map((c) => (
                <li key={c.id}>
                  <button type="button" className="link-btn" onClick={() => onGoTo(c.spaceId, c.id)}>
                    {c.title || 'Untitled'}
                  </button>{' '}
                  <span className="muted">
                    {c.tabs} · {c.spaceName}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="stat-panel" aria-labelledby="stat-sites">
          <h3 id="stat-sites">Most-saved sites</h3>
          {s.topSites.length === 0 ? (
            <p className="empty">No saved tabs yet.</p>
          ) : (
            <ol>
              {s.topSites.map((x) => (
                <li key={x.host}>
                  {x.host} <span className="muted">{x.tabs}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
