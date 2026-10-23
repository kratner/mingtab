import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { addCard, deleteCollection, listCards, updateCollection } from '../db/repo';
import type { Collection } from '../db/schema';
import { GROUP_COLORS, openCards } from '../tabs/tabs';
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

export function CollectionPanel({ collection, isNew }: { collection: Collection; isNew?: boolean }) {
  const cards = useLiveQuery(() => listCards(db, collection.id), [collection.id]) ?? [];
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

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
    <section className="collection" data-collection-id={collection.id} aria-label={collection.title}>
      <header className="collection-header">
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
        <span className="count">{cards.length}</span>
        <div className="collection-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Open all in ${collection.title}`}
            title={collection.groupColor ? 'Open all as a tab group' : 'Open all'}
            disabled={!cards.some((c) => c.url)}
            onClick={() =>
              openCards(cards, collection.groupColor ? { title: collection.title, color: collection.groupColor } : null)
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
          <button type="button" className="icon-btn danger" aria-label={`Delete ${collection.title}`} onClick={remove}>
            ✕
          </button>
        </div>
      </header>

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
            <ul className="cards">
              {cards.map((c) => (
                <CardRow key={c.id} card={c} />
              ))}
            </ul>
          ) : (
            !adding && <p className="empty small">No cards yet.</p>
          )}
        </>
      )}
    </section>
  );
}
