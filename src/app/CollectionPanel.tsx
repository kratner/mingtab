import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import {
  addCard,
  addTagToCollection,
  deleteCollection,
  listCards,
  listCollections,
  listTags,
  mergeCollections,
  removeTagFromCollection,
  updateCollection,
} from '../db/repo';
import { dragId, type DragData } from '../dnd/drop';
import type { Collection } from '../db/schema';
import { GROUP_COLORS, openCards, openSession } from '../tabs/tabs';
import { CardRow } from './CardRow';
import { InlineEdit } from './InlineEdit';

function normalizeUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`).toString();
  } catch {
    return null;
  }
}

interface Props {
  collection: Collection;
  isNew?: boolean;
  /** False while the space is sorted or filtered, and in the Starred view: no drag handle. */
  reorderable?: boolean;
  /** Scroll to and flash this collection (arriving from search). */
  highlight?: boolean;
  onHighlightDone?: () => void;
}

export function CollectionPanel({ collection, isNew, reorderable = true, highlight, onHighlightDone }: Props) {
  const cards = useLiveQuery(() => listCards(db, collection.id), [collection.id]) ?? [];
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [merging, setMerging] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const addNote = async () => {
    if (collection.collapsed) await updateCollection(db, collection.id, { collapsed: false });
    setNewNoteId((await addCard(db, collection.id, { url: '', title: 'Note' })).id);
  };
  const others = useLiveQuery(
    async () => (merging ? (await listCollections(db, collection.spaceId)).filter((c) => c.id !== collection.id) : []),
    [merging, collection.spaceId, collection.id],
  );
  const allTags = useLiveQuery(() => listTags(db)) ?? [];
  const [tagging, setTagging] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver, active } =
    useSortable({
      id: dragId.collection(collection.id),
      data: { type: 'collection', collection },
      // Still a drop target for cards and tabs when it can't be dragged itself.
      disabled: { draggable: !reorderable, droppable: false },
    });
  const el = useRef<HTMLElement | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!highlight || !el.current) return;
    el.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(true);
    const t = setTimeout(() => {
      setFlash(false);
      onHighlightDone?.();
    }, 1600);
    return () => clearTimeout(t);
  }, [highlight, onHighlightDone]);
  const tags = collection.tagIds.map((id) => allTags.find((t) => t.id === id)).filter((t) => !!t);
  const activeType = (active?.data.current as DragData | undefined)?.type;
  const isDropTarget = isOver && (activeType === 'card' || activeType === 'tab');

  const submit = async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError('Enter a valid URL.');
      return;
    }
    await addCard(db, collection.id, { url: normalized, title: title.trim() || normalized });
    setUrl('');
    setTitle('');
    setError('');
    setAdding(false);
  };

  const remove = () => {
    const what = cards.length ? ` and its ${cards.length} card${cards.length === 1 ? '' : 's'}` : '';
    if (confirm(`Delete "${collection.title}"${what}?`)) void deleteCollection(db, collection.id);
  };

  return (
    <section
      ref={(node) => {
        setNodeRef(node);
        el.current = node;
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`collection ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''} ${flash ? 'flash' : ''}`}
      data-collection-id={collection.id}
      aria-label={collection.title}
    >
      <header className="collection-header">
        {reorderable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="icon-btn drag-handle"
            aria-label={`Drag ${collection.title}`}
            title="Drag to reorder or move to another space"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={collection.collapsed ? `Expand ${collection.title}` : `Collapse ${collection.title}`}
          aria-expanded={!collection.collapsed}
          onClick={() => updateCollection(db, collection.id, { collapsed: !collection.collapsed })}
        >
          {collection.collapsed ? '▸' : '▾'}
        </button>
        <InlineEdit
          className="collection-title"
          label="Collection title"
          value={collection.title}
          startEditing={isNew}
          onSave={(t) => updateCollection(db, collection.id, { title: t })}
        />
        {collection.groupColor && (
          <span
            className="group-dot"
            style={{ background: GROUP_COLORS[collection.groupColor] }}
            title={`Reopens as a ${collection.groupColor} tab group`}
            aria-hidden
          />
        )}
        {collection.session && (
          <span className="count" title="Reopens as the windows and tab groups it was saved from">
            {collection.session.windows.length} window{collection.session.windows.length === 1 ? '' : 's'} ·
          </span>
        )}
        <span className="count">{cards.length}</span>
        <div className="collection-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Tag ${collection.title}`}
            title="Tags"
            aria-expanded={tagging}
            onClick={() => setTagging(!tagging)}
          >
            #
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Open all in ${collection.title}`}
            title={
              collection.session ? 'Reopen its windows and tab groups' : collection.groupColor ? 'Open all as a tab group' : 'Open all'
            }
            disabled={!cards.some((c) => c.url)}
            onClick={() =>
              collection.session
                ? openSession(cards, collection.session)
                : openCards(cards, collection.groupColor ? { title: collection.title, color: collection.groupColor } : null)
            }
          >
            ⧉
          </button>
          <button
            type="button"
            className={`icon-btn ${collection.starred ? 'starred' : ''}`}
            aria-label={collection.starred ? `Unstar ${collection.title}` : `Star ${collection.title}`}
            aria-pressed={collection.starred}
            onClick={() => updateCollection(db, collection.id, { starred: !collection.starred })}
          >
            {collection.starred ? '★' : '☆'}
          </button>
          <button type="button" className="icon-btn" aria-label={`Add card to ${collection.title}`} onClick={() => setAdding(true)}>
            +
          </button>
          <button type="button" className="icon-btn" aria-label={`Add note to ${collection.title}`} title="Add a note" onClick={addNote}>
            ✎
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Merge ${collection.title} into another collection`}
            title="Merge into…"
            aria-expanded={merging}
            onClick={() => setMerging(!merging)}
          >
            ⇲
          </button>
          <button type="button" className="icon-btn danger" aria-label={`Delete ${collection.title}`} onClick={remove}>
            ✕
          </button>
        </div>
      </header>

      {(tags.length > 0 || tagging) && (
        <div className="tag-row">
          {tags.map((t) => (
            <span key={t.id} className="tag-chip" style={{ borderColor: t.color, color: t.color }}>
              {t.name}
              {tagging && (
                <button
                  type="button"
                  className="tag-remove"
                  aria-label={`Remove tag ${t.name} from ${collection.title}`}
                  onClick={() => removeTagFromCollection(db, collection.id, t.id)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {tagging && (
            <form
              className="tag-add"
              onSubmit={async (e) => {
                e.preventDefault();
                if (tagDraft.trim()) await addTagToCollection(db, collection.id, tagDraft);
                setTagDraft('');
              }}
            >
              <input
                autoFocus
                aria-label={`Add tag to ${collection.title}`}
                placeholder="Add tag…"
                list={`tags-${collection.id}`}
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setTagging(false)}
              />
              <datalist id={`tags-${collection.id}`}>
                {allTags
                  .filter((t) => !collection.tagIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
              </datalist>
            </form>
          )}
        </div>
      )}
      {merging && (
        <div className="merge-row">
          <select
            autoFocus
            aria-label={`Merge ${collection.title} into`}
            defaultValue=""
            onChange={async (e) => {
              const target = others?.find((o) => o.id === e.target.value);
              if (target && confirm(`Move ${cards.length} card${cards.length === 1 ? '' : 's'} into "${target.title}" and delete "${collection.title}"?`)) {
                await mergeCollections(db, collection.id, target.id);
              }
              setMerging(false);
            }}
          >
            <option value="" disabled>
              Merge into…
            </option>
            {(others ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
          <button type="button" className="small" onClick={() => setMerging(false)}>
            Cancel
          </button>
        </div>
      )}
      {!collection.collapsed && (
        <>
          {adding && (
            <form
              className="add-card"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <input autoFocus aria-label="URL" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              <input aria-label="Title (optional)" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              {error && <p className="error">{error}</p>}
              <div className="row-end">
                <button type="button" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Add
                </button>
              </div>
            </form>
          )}
          {cards.length > 0 ? (
            <SortableContext items={cards.map((c) => dragId.card(c.id))} strategy={verticalListSortingStrategy}>
              <ul className="cards">
                {cards.map((c) => (
                  <CardRow key={c.id} card={c} startEditing={c.id === newNoteId} />
                ))}
              </ul>
            </SortableContext>
          ) : (
            !adding && <p className="empty small">No cards yet.</p>
          )}
        </>
      )}
    </section>
  );
}
