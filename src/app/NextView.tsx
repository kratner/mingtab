import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { clearDoneNext, listNext, removeNext, setNextDone } from '../db/next';
import type { NextItem } from '../db/schema';
import { dragId } from '../dnd/drop';
import { chromeFaviconUrl, hostOf } from './favicon';

function Row({ item }: { item: NextItem }) {
  const done = item.doneAt !== null;
  const { setNodeRef, attributes: a, listeners, transform, transition, isDragging } = useSortable({
    id: dragId.next(item.id),
    data: { type: 'next', item },
    disabled: done,
  });
  const { 'aria-disabled': _d, ...attributes } = a;
  const icon = chromeFaviconUrl(item.url) ?? (item.favIconUrl || null);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`card next-item ${done ? 'done' : ''} ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...(done ? {} : listeners)}
      role="listitem"
      aria-roledescription="draggable Next item"
      aria-label={item.title}
    >
      <div className="card-main">
        <input
          type="checkbox"
          className="next-check"
          checked={done}
          aria-label={done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
          onChange={(e) => setNextDone(db, item.id, e.target.checked)}
        />
        {icon ? <img className="favicon" src={icon} alt="" /> : <span className="favicon favicon-blank" aria-hidden />}
        <div className="card-text">
          <a className="card-title" href={item.url} target="_blank" rel="noreferrer" draggable={false} title={item.url}>
            {item.title}
          </a>
          <span className="card-host">{hostOf(item.url)}</span>
        </div>
        <div className="card-actions">
          <button type="button" className="icon-btn danger" aria-label={`Remove ${item.title} from Next`} onClick={() => removeNext(db, item.id)}>
            ✕
          </button>
        </div>
      </div>
    </li>
  );
}

/** The Next queue: what to get through, in order. */
export function NextView() {
  const q = useLiveQuery(() => listNext(db));
  const [showDone, setShowDone] = useState(false);
  if (!q) return null;
  return (
    <div className="space-view next-view">
      <div className="space-toolbar">
        <h2>▶ Next</h2>
        <span className="muted">{q.pending.length} to go</span>
      </div>
      {q.pending.length === 0 ? (
        <p className="empty">
          Nothing queued. Use ▶ on a saved card or an open tab to line up what you need to get through.
        </p>
      ) : (
        <section className="collection" aria-label="Up next">
          <SortableContext items={q.pending.map((n) => dragId.next(n.id))} strategy={verticalListSortingStrategy}>
            <ul className="cards">
              {q.pending.map((n) => (
                <Row key={n.id} item={n} />
              ))}
            </ul>
          </SortableContext>
        </section>
      )}
      {q.done.length > 0 && (
        <div className="next-done">
          <div className="row">
            <button type="button" className="small" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Hide' : 'Show'} done ({q.done.length})
            </button>
            <button type="button" className="small" onClick={() => clearDoneNext(db)}>
              Clear done
            </button>
          </div>
          {showDone && (
            <section className="collection" aria-label="Done">
              <ul className="cards">
                {q.done.map((n) => (
                  <Row key={n.id} item={n} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
