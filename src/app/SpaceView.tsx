import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { createCollection, listAllCollectionsInOrder, listCollections, listSpaces, listTags, updateCollection } from '../db/repo';
import type { Collection, Space } from '../db/schema';
import { dragId } from '../dnd/drop';
import { CollectionPanel } from './CollectionPanel';
import type { Density, SortMode } from './prefs';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'custom', label: 'Custom order' },
  { id: 'az', label: 'Name A–Z' },
  { id: 'za', label: 'Name Z–A' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
];

export function sortCollections(cols: Collection[], sort: SortMode): Collection[] {
  const byName = (a: Collection, b: Collection) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  switch (sort) {
    case 'az':
      return [...cols].sort(byName);
    case 'za':
      return [...cols].sort((a, b) => byName(b, a));
    case 'newest':
      return [...cols].sort((a, b) => b.createdAt - a.createdAt);
    case 'oldest':
      return [...cols].sort((a, b) => a.createdAt - b.createdAt);
    default:
      return cols; // already in position order
  }
}

interface Props {
  space: Space;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  density: Density;
  onDensity: (d: Density) => void;
  highlightId: string | null;
  onHighlightDone: () => void;
}

export function SpaceView({ space, sort, onSort, density, onDensity, highlightId, onHighlightDone }: Props) {
  const collections = useLiveQuery(() => listCollections(db, space.id), [space.id]);
  const tags = useLiveQuery(() => listTags(db)) ?? [];
  const [tagFilter, setTagFilter] = useState('');
  const [newId, setNewId] = useState<string | null>(null);

  const add = async () => {
    const c = await createCollection(db, space.id, 'New collection');
    setNewId(c.id);
    onSort('custom'); // a new collection goes at the end of the custom order; show it there
  };

  if (!collections) return null;
  const usedTags = tags.filter((t) => collections.some((c) => c.tagIds.includes(t.id)));
  const shown = sortCollections(
    tagFilter ? collections.filter((c) => c.tagIds.includes(tagFilter)) : collections,
    sort,
  );
  // Dragging to reorder only makes sense in custom order with nothing filtered out.
  const reorderable = sort === 'custom' && !tagFilter;
  const setAllCollapsed = (collapsed: boolean) =>
    Promise.all(shown.filter((c) => c.collapsed !== collapsed).map((c) => updateCollection(db, c.id, { collapsed })));

  return (
    <div className="space-view">
      <div className="space-toolbar">
        <h2>{space.name}</h2>
        <span className="muted">
          {shown.length === collections.length
            ? `${collections.length} collection${collections.length === 1 ? '' : 's'}`
            : `${shown.length} of ${collections.length} collections`}
        </span>
        <button type="button" className="primary" onClick={add}>
          + Collection
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
          <button type="button" className="small" onClick={() => setAllCollapsed(false)}>
            Expand all
          </button>
          <button type="button" className="small" onClick={() => setAllCollapsed(true)}>
            Collapse all
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
      ) : (
        <SortableContext items={shown.map((c) => dragId.collection(c.id))} strategy={rectSortingStrategy}>
          <div className="collections">
            {shown.map((c) => (
              <CollectionPanel
                key={c.id}
                collection={c}
                isNew={c.id === newId}
                reorderable={reorderable}
                highlight={c.id === highlightId}
                onHighlightDone={onHighlightDone}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
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
