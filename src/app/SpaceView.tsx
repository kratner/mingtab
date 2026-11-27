import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { createCollection, listAllCollectionsInOrder, listCollections, listSpaces, listTags, markOpened, updateCollection } from '../db/repo';
import { displayTitle, type Card, type Space } from '../db/schema';
import { dragId } from '../dnd/drop';
import { GroupBox, SelectBox, useSelection } from '../select/selection';
import { SelectToggle } from '../select/SelectToggle';
import {
  collectionMeta,
  GROUPS,
  groupBySite,
  groupByYear,
  isStale,
  SORTS,
  sortCollections,
  type GroupMode,
  type SiteGroup,
  type SortMode,
} from '../organise/organise';
import { Favicon } from './CardRow';
import { CollectionPanel } from './CollectionPanel';
import type { Density } from './prefs';

interface Props {
  space: Space;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  group: GroupMode;
  onGroup: (g: GroupMode) => void;
  density: Density;
  onDensity: (d: Density) => void;
  highlightId: string | null;
  onHighlightDone: () => void;
}

export function SpaceView({ space, sort, onSort, group, onGroup, density, onDensity, highlightId, onHighlightDone }: Props) {
  const collections = useLiveQuery(() => listCollections(db, space.id), [space.id]);
  const tags = useLiveQuery(() => listTags(db)) ?? [];
  const [tagFilter, setTagFilter] = useState('');
  const [newId, setNewId] = useState<string | null>(null);
  // Every live card in the space, in board order: tab counts, "Most tabs", and By site.
  const cards = useLiveQuery(async () => {
    const cols = await listCollections(db, space.id);
    const order = new Map(cols.map((c, i) => [c.id, i]));
    const all = await db.cards.where('collectionId').anyOf([...order.keys()]).filter((c) => c.deletedAt === null).toArray();
    return all.sort(
      (a, b) => order.get(a.collectionId)! - order.get(b.collectionId)! || (a.position < b.position ? -1 : a.position > b.position ? 1 : 0),
    );
  }, [space.id]);

  const add = async () => {
    const c = await createCollection(db, space.id, 'New collection');
    setNewId(c.id);
    onSort('custom'); // a new collection goes at the end of the custom order; show it there
    if (group === 'site') onGroup('none'); // an empty collection has no sites to show under
  };

  if (!collections) return null;
  const usedTags = tags.filter((t) => collections.some((c) => c.tagIds.includes(t.id)));
  const tabs = new Map<string, number>();
  for (const c of cards ?? []) if (c.url) tabs.set(c.collectionId, (tabs.get(c.collectionId) ?? 0) + 1);
  const shown = sortCollections(
    tagFilter ? collections.filter((c) => c.tagIds.includes(tagFilter)) : collections,
    sort,
    tabs,
  );
  const tabCount = cards ? shown.reduce((n, c) => n + (tabs.get(c.id) ?? 0), 0) : undefined;
  // Dragging to reorder only makes sense in custom order with nothing filtered out or regrouped.
  const reorderable = sort === 'custom' && !tagFilter && group === 'none';
  // Dates under each title when they're what the view is about.
  const showMeta = sort === 'recent' || sort === 'stale' || group === 'year';
  const now = Date.now();
  const panel = (c: (typeof shown)[number]) => (
    <CollectionPanel
      key={c.id}
      collection={c}
      isNew={c.id === newId}
      reorderable={reorderable}
      highlight={c.id === highlightId}
      onHighlightDone={onHighlightDone}
      meta={showMeta ? { text: collectionMeta(c, now), stale: isStale(c, now) } : undefined}
    />
  );
  const shownIds = new Set(shown.map((c) => c.id));
  const titles = new Map(collections.map((c) => [c.id, c.title]));
  const setAllCollapsed = (collapsed: boolean) =>
    Promise.all(shown.filter((c) => c.collapsed !== collapsed).map((c) => updateCollection(db, c.id, { collapsed })));
  const countText =
    (shown.length === collections.length
      ? `${collections.length} collection${collections.length === 1 ? '' : 's'}`
      : `${shown.length} of ${collections.length} collections`) +
    (tabCount !== undefined ? ` · ${tabCount.toLocaleString()} tab${tabCount === 1 ? '' : 's'}` : '');

  return (
    <div className="space-view">
      <div className="space-toolbar">
        <h2>{space.name}</h2>
        <span className="muted space-count" title={countText}>
          {countText}
        </span>
        <SelectToggle />
        <button type="button" className="primary tb-btn" title="New collection" onClick={add}>
          <span className="tb-icon" aria-hidden="true">
            +
          </span>
          <span className="tb-label">+ Collection</span>
        </button>
      </div>
      {collections.length > 0 && (
        <div className="view-controls">
          <select aria-label="Sort collections" value={sort} onChange={(e) => onSort(e.target.value as SortMode)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select aria-label="Group collections" value={group} onChange={(e) => onGroup(e.target.value as GroupMode)}>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          {usedTags.length > 0 && (
            <select aria-label="Filter by tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">All tags</option>
              {usedTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="small tb-btn" title="Expand all" onClick={() => setAllCollapsed(false)}>
            <span className="tb-icon" aria-hidden="true">
              ⇊
            </span>
            <span className="tb-label">Expand all</span>
          </button>
          <button type="button" className="small tb-btn" title="Collapse all" onClick={() => setAllCollapsed(true)}>
            <span className="tb-icon" aria-hidden="true">
              ⇈
            </span>
            <span className="tb-label">Collapse all</span>
          </button>
          <label className="check small-check">
            <input
              type="checkbox"
              checked={density === 'compact'}
              onChange={(e) => onDensity(e.target.checked ? 'compact' : 'comfortable')}
            />
            Compact
          </label>
        </div>
      )}
      {collections.length === 0 ? (
        <p className="empty">This space is empty. Add a collection to start.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No collections with that tag here.</p>
      ) : group === 'site' ? (
        <SiteView sites={groupBySite((cards ?? []).filter((c) => shownIds.has(c.collectionId)))} titles={titles} />
      ) : (
        <SortableContext items={shown.map((c) => dragId.collection(c.id))} strategy={rectSortingStrategy}>
          {sort === 'recent' || sort === 'stale' ? (
            <p className="muted small view-note">
              MingTab started recording when you open a collection's tabs in version 0.15, so older collections read
              "never opened" until you next open one from MingTab.
            </p>
          ) : null}
          {group === 'year' ? (
            groupByYear(shown).map((y) => (
              <section key={y.year} className="year-group" aria-label={String(y.year)}>
                <h3 className="group-heading">
                  <span>{y.year}</span>
                  <span className="muted">
                    {plural(y.collections.length, 'collection')} ·{' '}
                    {plural(y.collections.reduce((n, c) => n + (tabs.get(c.id) ?? 0), 0), 'tab')}
                  </span>
                </h3>
                <div className="collections">{y.collections.map(panel)}</div>
              </section>
            ))
          ) : (
            <div className="collections">{shown.map(panel)}</div>
          )}
        </SortableContext>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/**
 * By site: every saved tab on show, gathered by website. Each tab still lives in its collection (named on its row);
 * this only regroups them, so it's quick to select, say, every YouTube tab and move them together.
 */
function SiteView({ sites, titles }: { sites: SiteGroup[]; titles: Map<string, string> }) {
  if (sites.length === 0) return <p className="empty">No saved tabs here yet.</p>;
  return (
    <>
      <p className="muted small view-note">
        Every saved tab here, gathered by website. Tabs stay in their own collections; this view only regroups them.
      </p>
      <div className="collections">
        {sites.map((s) => (
          <SitePanel key={s.host} site={s} titles={titles} />
        ))}
      </div>
    </>
  );
}

function SitePanel({ site, titles }: { site: SiteGroup; titles: Map<string, string> }) {
  const sel = useSelection();
  const [open, setOpen] = useState(true);
  return (
    <section className="collection site-group" aria-label={site.host}>
      <header className="collection-header">
        {sel.active && <GroupBox ids={site.cards.map((c) => c.id)} label={site.host} />}
        <button
          type="button"
          className="icon-btn"
          aria-label={open ? `Collapse ${site.host}` : `Expand ${site.host}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="collection-title site-host">{site.host}</span>
        <span className="count">{site.cards.length}</span>
      </header>
      {open && (
        <ul className="cards">
          {site.cards.map((c) => (
            <SiteCard key={c.id} card={c} where={titles.get(c.collectionId) ?? ''} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SiteCard({ card, where }: { card: Card; where: string }) {
  const sel = useSelection();
  const title = displayTitle(card);
  const selected = sel.active && sel.ids.has(card.id);
  return (
    <li
      className={`card ${selected ? 'selected' : ''}`}
      data-card-id={card.id}
      aria-label={title}
      onClick={(e) => {
        if (!sel.active || (e.target as HTMLElement).closest('.select-box')) return;
        e.preventDefault();
        sel.toggle(card.id, !selected, e.shiftKey);
      }}
    >
      <div className="card-main">
        {sel.active && <SelectBox id={card.id} label={title} />}
        <Favicon card={card} />
        <div className="card-text">
          <a
            className="card-title"
            href={card.url}
            target="_blank"
            rel="noreferrer"
            title={title === card.url ? card.url : `${title}\n${card.url}`}
            onClick={() => !sel.active && void markOpened(db, [card.collectionId])}
            onAuxClick={(e) => e.button === 1 && void markOpened(db, [card.collectionId])}
          >
            {title}
          </a>
          <span className="card-where muted">in {where}</span>
        </div>
      </div>
    </li>
  );
}

/** Starred collections from every space, each labelled with its space. */
export function StarredView({ onGoTo }: { onGoTo: (spaceId: string, collectionId?: string) => void }) {
  const data = useLiveQuery(async () => {
    const [spaces, all] = await Promise.all([listSpaces(db), listAllCollectionsInOrder(db)]);
    return { spaces: new Map(spaces.map((s) => [s.id, s.name])), starred: all.filter((c) => c.starred) };
  });
  if (!data) return null;
  return (
    <div className="space-view">
      <div className="space-toolbar">
        <h2>★ Starred</h2>
        <span className="muted">
          {data.starred.length} collection{data.starred.length === 1 ? '' : 's'}
        </span>
        {data.starred.length > 0 && <SelectToggle />}
      </div>
      {data.starred.length === 0 ? (
        <p className="empty">Star a collection (☆ in its header) to keep it here, whatever space it's in.</p>
      ) : (
        <div className="collections">
          {data.starred.map((c) => (
            <div key={c.id} className="starred-item">
              <button type="button" className="space-crumb" onClick={() => onGoTo(c.spaceId, c.id)}>
                {data.spaces.get(c.spaceId)} ›
              </button>
              <CollectionPanel collection={c} reorderable={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
