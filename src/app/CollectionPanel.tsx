import { SortableContext, useSortable, type SortingStrategy } from '@dnd-kit/sortable';
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
  markOpened,
  mergeCollections,
  removeTagFromCollection,
  updateCollection,
} from '../db/repo';
import { useDropIndicator } from '../dnd/DndProvider';
import { dragId, type DragData } from '../dnd/drop';
import type { Collection } from '../db/schema';
import { GROUP_COLORS, openCards, openSession } from '../tabs/tabs';
import { GroupBox, useSelection } from '../select/selection';
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

/**
 * Cards don't slide aside while a card is dragged: the drop line shows where it will land. dnd-kit measures the
 * hovered card where the strategy would have slid it, so a sliding strategy here puts the line on the wrong card.
 */
const cardsStayPut: SortingStrategy = () => null;

interface Props {
  collection: Collection;
  isNew?: boolean;
  /** False while the space is sorted or filtered, and in the Starred view: no drag handle. */
  reorderable?: boolean;
  /** Scroll to and flash this collection (arriving from search). */
  highlight?: boolean;
  onHighlightDone?: () => void;
  /** "Saved Mar 2021 · opened 3 days ago", shown when sorting by opened or grouping by year. */
  meta?: { text: string; stale: boolean };
}

interface MenuItem {
  label: string;
  /** Accessible name; keeps the names the header buttons had before they moved into the menu. */
  aria: string;
  icon: string;
  run: () => unknown;
  danger?: boolean;
}

/** The ⋯ menu in a collection's header: the less frequent actions, so the header stays quiet. */
function ActionsMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('pointerdown', away);
    return () => removeEventListener('pointerdown', away);
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    const all = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
    }
  };
  return (
    <div className="menu-wrap" ref={root} onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        className="icon-btn"
        aria-label={`More actions for ${label}`}
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={`Actions for ${label}`}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`menu-item ${it.danger ? 'danger' : ''}`}
              aria-label={it.aria}
              onClick={() => {
                setOpen(false);
                void it.run();
              }}
            >
              <span className="menu-icon" aria-hidden>
                {it.icon}
              </span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CollectionPanel({ collection, isNew, reorderable = true, highlight, onHighlightDone, meta }: Props) {
  const cards = useLiveQuery(() => listCards(db, collection.id), [collection.id]) ?? [];
  const selecting = useSelection().active;
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
  // Over the collection itself (header, gaps): the card or tab goes to the end, so the line sits after the last card.
  const appendLine = useDropIndicator()?.over === dragId.collection(collection.id);

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
      className={`collection ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''} ${appendLine ? 'drop-append' : ''} ${flash ? 'flash' : ''}`}
      data-collection-id={collection.id}
      aria-label={collection.title}
    >
      <header className="collection-header">
        {selecting && <GroupBox ids={cards.map((c) => c.id)} label={collection.title} />}
        {reorderable && !selecting && (
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
          title={collection.collapsed ? 'Expand' : 'Collapse'}
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
            aria-label={`Open all in ${collection.title}`}
            title={
              collection.session ? 'Reopen its windows and tab groups' : collection.groupColor ? 'Open all as a tab group' : 'Open all'
            }
            disabled={!cards.some((c) => c.url)}
            onClick={() => {
              void markOpened(db, [collection.id]);
              return collection.session
                ? openSession(cards, collection.session)
                : openCards(cards, collection.groupColor ? { title: collection.title, color: collection.groupColor } : null);
            }}
          >
            ⧉
          </button>
          <button
            type="button"
            className={`icon-btn ${collection.starred ? 'starred' : ''}`}
            aria-label={collection.starred ? `Unstar ${collection.title}` : `Star ${collection.title}`}
            title={collection.starred ? 'Unstar' : 'Star'}
            aria-pressed={collection.starred}
            onClick={() => updateCollection(db, collection.id, { starred: !collection.starred })}
          >
            {collection.starred ? '★' : '☆'}
          </button>
          <ActionsMenu
            label={collection.title}
            items={[
              { label: 'Add a link', aria: `Add card to ${collection.title}`, icon: '+', run: () => setAdding(true) },
              { label: 'Add a note', aria: `Add note to ${collection.title}`, icon: '✎', run: addNote },
              { label: 'Tags…', aria: `Tag ${collection.title}`, icon: '#', run: () => setTagging(!tagging) },
              { label: 'Merge into…', aria: `Merge ${collection.title} into another collection`, icon: '⇲', run: () => setMerging(!merging) },
              { label: 'Delete collection', aria: `Delete ${collection.title}`, icon: '✕', run: remove, danger: true },
            ]}
          />
        </div>
      </header>
      {meta && (
        <p className={`collection-meta ${meta.stale ? 'stale' : ''}`} title={meta.stale ? 'Saved over a year ago and not opened in the past year' : undefined}>
          {meta.text}
        </p>
      )}

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
                  title="Remove tag"
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
            <SortableContext items={cards.map((c) => dragId.card(c.id))} strategy={cardsStayPut}>
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
