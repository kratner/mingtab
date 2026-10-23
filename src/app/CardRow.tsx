import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { addToNext } from '../db/next';
import { deleteCard, updateCard } from '../db/repo';
import { displayTitle, type Card } from '../db/schema';
import { setCardShortcut, ShortcutError } from '../db/shortcuts';
import { dragId } from '../dnd/drop';
import { NoteBody } from '../notes/NoteBody';
import { taskCounts } from '../notes/markdown';
import { chromeFaviconUrl, hostOf } from './favicon';

function Favicon({ card }: { card: Card }) {
  const sources = [chromeFaviconUrl(card.url), card.favIconUrl].filter((s): s is string => !!s);
  const [i, setI] = useState(0);
  if (!card.url) return <span className="favicon note-icon" aria-hidden>✎</span>;
  if (i >= sources.length) return <span className="favicon favicon-blank" aria-hidden />;
  return <img className="favicon" src={sources[i]} alt="" onError={() => setI(i + 1)} />;
}

export function CardRow({ card, startEditing = false }: { card: Card; startEditing?: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  const [customTitle, setCustomTitle] = useState(card.customTitle);
  const [note, setNote] = useState(card.note);
  const [shortcut, setShortcut] = useState(card.shortcut ?? '');
  const [error, setError] = useState('');
  const [queued, setQueued] = useState('');
  // Ticking a checklist item shows at once; the save follows.
  const [shownNote, setShownNote] = useState(card.note);
  useEffect(() => setShownNote(card.note), [card.note]);
  const title = displayTitle(card);
  const isNote = !card.url;
  const tasks = taskCounts(shownNote);
  // The whole row is the drag source; the 6px activation distance keeps clicks working.
  const { setNodeRef, attributes: sortableAttrs, listeners, transform, transition, isDragging } = useSortable({
    id: dragId.card(card.id),
    data: { type: 'card', card },
    disabled: editing,
  });
  // dnd-kit marks a disabled source aria-disabled, which would make the edit
  // form's inputs read as disabled too. Only "can't drag right now" is meant.
  const { 'aria-disabled': _disabled, ...attributes } = sortableAttrs;

  const startEdit = () => {
    setCustomTitle(card.customTitle);
    setNote(card.note);
    setShortcut(card.shortcut ?? '');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    try {
      if (!isNote && shortcut.trim() !== (card.shortcut ?? '')) await setCardShortcut(db, card.id, shortcut);
    } catch (e) {
      if (e instanceof ShortcutError) return setError(e.message);
      throw e;
    }
    await updateCard(db, card.id, { customTitle: customTitle.trim(), note: note.replace(/\s+$/, '') });
    setEditing(false);
  };

  const queue = async () => {
    const { added } = await addToNext(db, { cardId: card.id, url: card.url, title, favIconUrl: card.favIconUrl });
    setQueued(added ? 'Added to Next' : 'Already in Next');
    setTimeout(() => setQueued(''), 1800);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`card ${isDragging ? 'dragging' : ''} ${isNote ? 'note-card' : ''}`}
      data-card-id={card.id}
      {...attributes}
      {...listeners}
      role="listitem"
      aria-roledescription={isNote ? 'draggable note' : 'draggable card'}
      aria-label={title}
    >
      <div className="card-main">
        <Favicon card={card} />
        <div className="card-text">
          {isNote ? (
            <span className="card-title note-title">
              {title}
              {tasks.total > 0 && (
                <span className="badge" aria-label={`${tasks.done} of ${tasks.total} done`}>
                  {tasks.done}/{tasks.total}
                </span>
              )}
            </span>
          ) : (
            <a
              className="card-title"
              href={card.url}
              target="_blank"
              rel="noreferrer"
              draggable={false}
              title={title === card.url ? card.url : `${title}\n${card.url}`}
            >
              {title}
            </a>
          )}
          {shownNote && !editing && (
            <NoteBody
              note={shownNote}
              label={title}
              onChange={(next) => {
                setShownNote(next);
                void updateCard(db, card.id, { note: next });
              }}
            />
          )}
          {!isNote && !card.note && (
            <span className="card-host">
              {hostOf(card.url)}
              {card.shortcut && <span className="shortcut-tag"> · to/{card.shortcut}</span>}
            </span>
          )}
          {!isNote && card.note && card.shortcut && <span className="card-host shortcut-tag">to/{card.shortcut}</span>}
          {queued && (
            <span className="card-host" role="status">
              {queued}
            </span>
          )}
        </div>
        <div className="card-actions">
          {!isNote && (
            <button type="button" className="icon-btn" aria-label={`Add ${title} to Next`} title="Add to Next" onClick={queue}>
              ▶
            </button>
          )}
          <button type="button" className="icon-btn" aria-label={`Edit ${title}`} onClick={() => (editing ? setEditing(false) : startEdit())}>
            ✎
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`Delete ${title}`}
            onClick={() => deleteCard(db, card.id)}
          >
            ✕
          </button>
        </div>
      </div>
      {editing && (
        <form
          className="card-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            Title
            <input
              autoFocus={isNote}
              value={customTitle}
              placeholder={card.title}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </label>
          <label>
            Note
            <textarea
              value={note}
              rows={isNote ? 6 : 2}
              placeholder={isNote ? '- [ ] a task\n**bold**, *italic*, links' : ''}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {!isNote && (
            <label>
              Shortcut: type <b>to/</b>, Space, then this in the address bar
              <span className="shortcut-input">
                <span aria-hidden>to/</span>
                <input aria-label="Shortcut" value={shortcut} placeholder="docs" onChange={(e) => setShortcut(e.target.value)} />
              </span>
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row-end">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
