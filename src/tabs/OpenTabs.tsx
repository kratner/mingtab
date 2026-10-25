import { useDraggable } from '@dnd-kit/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { addCard, createCollection, createSpace, listCollections } from '../db/repo';
import { chromeFaviconUrl } from '../app/favicon';
import { InlineEdit } from '../app/InlineEdit';
import {
  GROUP_COLORS,
  closeTab,
  extensionOrigin,
  focusTab,
  groupLooseTabs,
  isSavableUrl,
  mergeWindowsInto,
  ungroup,
  updateGroup,
  saveAllWindows,
  saveGroup,
  saveWindow,
  sessionTitle,
  tabToCard,
  type SaveResult,
} from './tabs';
import { dragId } from '../dnd/drop';
import { addToNext } from '../db/next';
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
  /** The window whose "Save window" name field is open, and the name typed so far. */
  const [naming, setNaming] = useState<{ windowId: number; title: string } | null>(null);

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
      <div className="pane-head">
        <h2 className="pane-title">Open tabs</h2>
        <div className="pane-actions">
          {state.windows.length > 1 && (
            <button
              type="button"
              className="small"
              onClick={async () => {
                const current = state.windows.find((w) => w.isCurrent) ?? state.windows[0]!;
                await mergeWindowsInto(current.id);
                setStatus(`Merged ${state.windows.length} windows into this one.`);
              }}
            >
              Merge windows
            </button>
          )}
          <button
            type="button"
            className="primary small"
            disabled={!state.windows.some((w) => w.tabs.some((t) => !t.pinned && isSavableUrl(t.url, origin)))}
            title="Save every window into one collection, keeping windows and tab groups"
            onClick={async () => {
              const r = await saveAllWindows(db, { spaceId: await ensureSpace(), close: closeOnSave });
              setStatus(
                r
                  ? `Saved ${r.saved} tab${r.saved === 1 ? '' : 's'} from ${r.windows} window${r.windows === 1 ? '' : 's'} to "${r.collection.title}"${closeOnSave ? ' and closed them' : ''}.`
                  : 'Nothing to save.',
              );
            }}
          >
            Save all
          </button>
        </div>
      </div>
      {status && (
        <p className="pane-status" role="status">
          {status}
        </p>
      )}
      {state.windows.map((w, i) => {
        const label = w.isCurrent ? 'This window' : `Window ${i + 1}`;
        const savable = w.tabs.filter((t) => !t.pinned && isSavableUrl(t.url, origin)).length;
        const loose = w.tabs.filter((t) => !t.pinned && (t.groupId ?? -1) === -1).length;
        return (
          <section key={w.id} className="window" aria-label={`${label}, ${w.tabs.length} tabs`}>
            <header className="window-header">
              <span className="window-title">{label}</span>
              <span className="count">{w.tabs.length} tabs</span>
              <button
                type="button"
                className="small"
                disabled={loose === 0}
                title="Put this window's ungrouped tabs into a new tab group"
                onClick={() => groupLooseTabs(w.id)}
              >
                Group
              </button>
              <button
                type="button"
                className="primary small"
                disabled={savable === 0}
                aria-expanded={naming?.windowId === w.id}
                title="Save this window's tabs as a new collection"
                onClick={() => setNaming(naming?.windowId === w.id ? null : { windowId: w.id, title: sessionTitle() })}
              >
                Save window
              </button>
            </header>
            {naming?.windowId === w.id && (
              <form
                className="save-name"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const title = naming.title;
                  setNaming(null);
                  report(await saveWindow(db, w.id, { spaceId: await ensureSpace(), close: closeOnSave, title }), 'window');
                }}
              >
                <input
                  autoFocus
                  aria-label="Collection name"
                  placeholder="Collection name"
                  value={naming.title}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNaming({ windowId: w.id, title: e.target.value })}
                  onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
                />
                <button type="submit" className="primary small">
                  Save
                </button>
                <button type="button" className="small" onClick={() => setNaming(null)}>
                  Cancel
                </button>
              </form>
            )}
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
                    <label className="group-color" title="Group color">
                      <span className="group-dot" style={{ background: GROUP_COLORS[group.color] }} aria-hidden />
                      <select
                        aria-label={`Color of ${name}`}
                        value={group.color}
                        onChange={(e) => updateGroup(group.id, { color: e.target.value })}
                      >
                        {Object.keys(GROUP_COLORS).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <InlineEdit
                      className="tab-group-title"
                      label="Group name"
                      value={group.title ?? ''}
                      placeholder="Unnamed group"
                      allowEmpty
                      onSave={(t) => updateGroup(group.id, { title: t })}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Ungroup ${name}`}
                      title="Ungroup"
                      onClick={() => ungroup(group.id)}
                    >
                      ⊟
                    </button>
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
  const { setNodeRef, attributes: dragAttrs, listeners, isDragging } = useDraggable({
    id: dragId.tab(tab.id!),
    data: { type: 'tab', tab },
    disabled: !savable,
  });
  const { 'aria-disabled': _disabled, ...attributes } = dragAttrs; // see CardRow

  const saveTo = async (choice: string) => {
    setPicking(false);
    if (!choice) return;
    const collectionId = choice === NEW ? (await createCollection(db, await ensureSpace(), 'Saved tabs')).id : choice;
    await addCard(db, collectionId, tabToCard(tab));
    const col = await db.collections.get(collectionId);
    onSaved(`Saved "${title}" to "${col?.title}".`);
  };

  return (
    <li
      ref={setNodeRef}
      className={`open-tab ${tab.active ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
      role="listitem"
      aria-roledescription="draggable tab"
    >
      <button type="button" className="open-tab-main" title={tab.url} onClick={() => focusTab(tab)}>
        {icon ? <img className="favicon" src={icon} alt="" /> : <span className="favicon favicon-blank" aria-hidden />}
        <span className="open-tab-title">{title}</span>
      </button>
      {savable && !picking && (
        <button
          type="button"
          className="icon-btn"
          aria-label={`Add ${title} to Next`}
          title="Add to Next"
          onClick={async () => {
            const card = tabToCard(tab);
            const { added } = await addToNext(db, { ...card, title: card.title || card.url });
            onSaved(added ? `Added "${title}" to Next.` : `"${title}" is already in Next.`);
          }}
        >
          ▶
        </button>
      )}
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
            title="Save to a collection"
            onClick={async () => {
              await ensureSpace();
              setPicking(true);
            }}
          >
            ⤓
          </button>
        ))}
      <button
        type="button"
        className="icon-btn danger"
        aria-label={`Close ${title}`}
        title="Close tab"
        onClick={() => void closeTab(tab)}
      >
        ✕
      </button>
    </li>
  );
}
