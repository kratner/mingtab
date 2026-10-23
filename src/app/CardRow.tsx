import { useState } from 'react';
import { db } from '../db/db';
import { deleteCard, updateCard } from '../db/repo';
import { displayTitle, type Card } from '../db/schema';
import { chromeFaviconUrl, hostOf } from './favicon';

function Favicon({ card }: { card: Card }) {
  const sources = [chromeFaviconUrl(card.url), card.favIconUrl].filter((s): s is string => !!s);
  const [i, setI] = useState(0);
  if (i >= sources.length) return <span className="favicon favicon-blank" aria-hidden />;
  return <img className="favicon" src={sources[i]} alt="" onError={() => setI(i + 1)} />;
}

export function CardRow({ card }: { card: Card }) {
  const [editing, setEditing] = useState(false);
  const [customTitle, setCustomTitle] = useState(card.customTitle);
  const [note, setNote] = useState(card.note);
  const title = displayTitle(card);
  const isNote = !card.url;

  const save = async () => {
    await updateCard(db, card.id, { customTitle: customTitle.trim(), note: note.trim() });
    setEditing(false);
  };

  return (
    <li className="card" data-card-id={card.id}>
      <div className="card-main">
        <Favicon card={card} />
        <div className="card-text">
          {isNote ? (
            <span className="card-title" title="Toby note — its text wasn't included in Toby's export">
              {title} <span className="badge">note</span>
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
          {card.note && !editing && <p className="card-note">{card.note}</p>}
          {!isNote && !card.note && <span className="card-host">{hostOf(card.url)}</span>}
        </div>
        <div className="card-actions">
          <button type="button" className="icon-btn" aria-label={`Edit ${title}`} onClick={() => setEditing(!editing)}>
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
            <input value={customTitle} placeholder={card.title} onChange={(e) => setCustomTitle(e.target.value)} />
          </label>
          <label>
            Note
            <textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)} />
          </label>
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
