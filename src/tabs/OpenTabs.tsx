import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { addCard, createCollection, createSpace, listCollections } from '../db/repo';
import { chromeFaviconUrl } from '../app/favicon';
import {
  GROUP_COLORS,
  extensionOrigin,
  focusTab,
  isSavableUrl,
  saveGroup,
  saveWindow,
  tabToCard,
  type SaveResult,
} from './tabs';
import { runsOf, useOpenWindows } from './useOpenWindows';

interface Props {
  /** Space that saves go into. Created on first save if there is none. */
  spaceId: string | null;
  onSpaceCreated: (id: string) => void;
  closeOnSave: boolean;
}

export function OpenTabs({ spaceId, onSpaceCreated, closeOnSave }: Props) {
  const state = useOpenWindows();
  const [status, setStatus] = useState('');

  const ensureSpace = async () => {
    if (spaceId) return spaceId;
    const s = await createSpace(db, 'My Collections');
    onSpaceCreated(s.id);
    return s.id;
  };

  const report = (r: SaveResult | null, what: string) =>
    setStatus(
      r
        ? `Saved ${r.saved} tab${r.saved === 1 ? '' : 's'} to "${r.collection.title}"${closeOnSave ? ' and closed them' : ''}.`
        : `Nothing to save in this ${what}.`,
    );

  if (!state) return null;
  const origin = extensionOrigin();

  return (
    <aside className="open-tabs" aria-label="Open tabs">
      <h2 className="pane-title">Open tabs</h2>
      {status && (
        <p className="pane-status" role="status">
          {status}
        </p>
      )}
      {state.windows.map((w, i) => {
        const label = w.isCurrent ? 'This window' : `Window ${i + 1}`;
        const savable = w.tabs.filter((t) => !t.pinned && isSavableUrl(t.url, origin)).length;
        return (
          <section key={w.id} className="window" aria-label={`${label}, ${w.tabs.length} tabs`}>
            <header className="window-header">
              <span className="window-title">{label}</span>
              <span className="count">{w.tabs.length} tabs</span>
              <button
                type="button"
                className="primary small"
                disabled={savable === 0}
                onClick={async () => report(await saveWindow(db, w.id, { spaceId: await ensureSpace(), close: closeOnSave }), 'window')}
              >
                Save window
              </button>
            </header>
            {runsOf(w.tabs).map((run) => {
              const group = run.groupId >= 0 ? state.groups.get(run.groupId) : undefined;
              const rows = run.tabs.map((t) => (
                <OpenTabRow key={t.id} tab={t} spaceId={spaceId} ensureSpace={ensureSpace} onSaved={setStatus} origin={origin} />
              ));
              if (!group) return <ul key={`u-${run.tabs[0]!.id}`} className="tab-list">{rows}</ul>;
              const name = group.title || 'Unnamed group';
              return (
                <div key={`g-${group.id}`} className="tab-group" role="group" aria-label={`Tab group ${name}`}>
                  <header className="tab-group-header">
                    <span className="group-dot" style={{ background: GROUP_COLORS[group.color] }} aria-hidden />
                    <span className="tab-group-title">{name}</span>
                    <button
                      type="button"
                      className="small"
                      onClick={async () =>
                        report(await saveGroup(db, group.id, { spaceId: await ensureSpace(), close: closeOnSave }), 'group')
                      }
                    >
                      Save group
                    </button>
                  </header>
                  <ul className="tab-list">{rows}</ul>
                </div>
              );
            })}
          </section>
        );
      })}
    </aside>
  );
}

const NEW = '__new__';

function OpenTabRow({
  tab,
  spaceId,
  ensureSpace,
  onSaved,
  origin,
}: {
  tab: chrome.tabs.Tab;
  spaceId: string | null;
  ensureSpace: () => Promise<string>;
  onSaved: (msg: string) => void;
  origin: string;
}) {
  const [picking, setPicking] = useState(false);
  const collections = useLiveQuery(() => (spaceId && picking ? listCollections(db, spaceId) : []), [spaceId, picking]);
  const title = tab.title || tab.url || 'Untitled';
  const icon = tab.favIconUrl && /^(https?:|data:)/.test(tab.favIconUrl) ? tab.favIconUrl : chromeFaviconUrl(tab.url ?? '');
  const savable = isSavableUrl(tab.url, origin);

  const saveTo = async (choice: string) => {
    setPicking(false);
    if (!choice) return;
    const collectionId = choice === NEW ? (await createCollection(db, await ensureSpace(), 'Saved tabs')).id : choice;
    await addCard(db, collectionId, tabToCard(tab));
    const col = await db.collections.get(collectionId);
    onSaved(`Saved "${title}" to "${col?.title}".`);
  };

  return (
    <li className={`open-tab ${tab.active ? 'active' : ''}`}>
      <button type="button" className="open-tab-main" title={tab.url} onClick={() => focusTab(tab)}>
        {icon ? <img className="favicon" src={icon} alt="" /> : <span className="favicon favicon-blank" aria-hidden />}
        <span className="open-tab-title">{title}</span>
      </button>
      {savable &&
        (picking ? (
          <select
            autoFocus
            aria-label={`Save ${title} to collection`}
            defaultValue=""
            onBlur={() => setPicking(false)}
            onChange={(e) => void saveTo(e.target.value)}
          >
            <option value="" disabled>
              Save to…
            </option>
            {(collections ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
            <option value={NEW}>+ New collection</option>
          </select>
        ) : (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Save ${title}`}
            onClick={async () => {
              await ensureSpace();
              setPicking(true);
            }}
          >
            ⤓
          </button>
        ))}
    </li>
  );
}
