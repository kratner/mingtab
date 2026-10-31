import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { addToNext } from '../db/next';
import { listAllCollectionsInOrder } from '../db/repo';
import { displayTitle, type Space } from '../db/schema';
import { openCards } from '../tabs/tabs';
import { collectionFromCards, deleteSelected, placeCards, selectedInOrder, type Mode } from './actions';
import { useSelection } from './selection';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Opening more than this many tabs at once asks first. */
const OPEN_WARN = 15;

interface Props {
  spaces: Space[];
  /** The space on screen, if any: the default home for a new collection. */
  spaceId: string | null;
  onGoTo: (spaceId: string, collectionId?: string) => void;
}

/** The bar along the bottom in select mode, and the dialogs it opens. */
export function SelectionBar({ spaces, spaceId, onGoTo }: Props) {
  const sel = useSelection();
  const cards = useLiveQuery(() => selectedInOrder(db, sel.ids), [sel.ids]) ?? [];
  const [dialog, setDialog] = useState<'new' | 'move' | 'copy' | null>(null);
  const hidden = useHiddenCount(cards.map((c) => c.id));
  if (!sel.active) return null;

  const n = cards.length;
  const tabs = cards.filter((c) => c.url);
  const done = (text: string, undo?: () => Promise<void>) => sel.notify({ text, undo });

  const open = async () => {
    if (tabs.length > OPEN_WARN && !confirm(`Open ${tabs.length} tabs?`)) return;
    await openCards(tabs);
  };
  const queue = async () => {
    let added = 0;
    for (const c of tabs) if ((await addToNext(db, { cardId: c.id, url: c.url, title: displayTitle(c), favIconUrl: c.favIconUrl })).added) added++;
    done(added === tabs.length ? `Added ${plural(added, 'tab')} to Next.` : `Added ${added} to Next; ${tabs.length - added} were already there.`);
  };
  const remove = async () => {
    const undo = await deleteSelected(db, cards);
    sel.clear();
    done(`Deleted ${plural(n, 'card')}.`, undo);
  };

  return (
    <>
      <div className="select-bar" role="toolbar" aria-label="Selected cards">
        <span className="select-count" role="status">
          {n === 0 ? 'Tick cards to select them' : `${n} selected`}
          {hidden > 0 && <span className="muted"> · {hidden} not shown here</span>}
        </span>
        <button type="button" className="primary" disabled={n === 0} onClick={() => setDialog('new')}>
          New collection…
        </button>
        <button type="button" disabled={n === 0} onClick={() => setDialog('move')}>
          Move to…
        </button>
        <button type="button" disabled={n === 0} onClick={() => setDialog('copy')}>
          Copy to…
        </button>
        <button type="button" disabled={tabs.length === 0} onClick={open}>
          Open
        </button>
        <button type="button" disabled={tabs.length === 0} onClick={queue}>
          Add to Next
        </button>
        <button type="button" className="danger-btn" disabled={n === 0} onClick={remove}>
          Delete
        </button>
        <button type="button" disabled={n === 0} onClick={sel.clear}>
          Clear
        </button>
        <button type="button" onClick={sel.stop}>
          Done
        </button>
      </div>
      {dialog && (
        <PlaceDialog
          kind={dialog}
          count={n}
          spaces={spaces}
          spaceId={spaceId}
          onClose={() => setDialog(null)}
          onNew={async (spaceTo, title, mode) => {
            const { id, undo } = await collectionFromCards(db, spaceTo, title, cards, mode);
            setDialog(null);
            sel.stop();
            onGoTo(spaceTo, id);
            done(`Made "${title}" with ${plural(n, 'card')}.`, undo);
          }}
          onPlace={async (collectionId, title, mode) => {
            const undo = await placeCards(db, cards, collectionId, mode);
            setDialog(null);
            sel.clear();
            done(`${mode === 'move' ? 'Moved' : 'Copied'} ${plural(n, 'card')} to "${title}".`, undo);
          }}
        />
      )}
    </>
  );
}

/** The undo toast; it outlives select mode, so it sits beside the bar, not in it. */
export function SelectionNotice() {
  const { notice, notify } = useSelection();
  if (!notice) return null;
  return (
    <div className="toast select-notice" role="status" aria-label="Done">
      {notice.text}
      {notice.undo && (
        <button
          type="button"
          onClick={async () => {
            await notice.undo!();
            notify({ text: 'Undone.' });
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

/** How many of the chosen cards aren't on screen (selection carries across spaces and searches). */
function useHiddenCount(ids: string[]) {
  const [hidden, setHidden] = useState(0);
  const key = ids.join();
  useEffect(() => {
    const count = () => {
      const shown = new Set([...document.querySelectorAll<HTMLElement>('[data-select-id]')].map((e) => e.dataset.selectId));
      setHidden(ids.filter((id) => !shown.has(id)).length);
    };
    count();
    const obs = new MutationObserver(count);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [key]); // `ids` changes identity every render; `key` is its content
  return hidden;
}

interface DialogProps {
  kind: 'new' | 'move' | 'copy';
  count: number;
  spaces: Space[];
  spaceId: string | null;
  onClose: () => void;
  onNew: (spaceId: string, title: string, mode: Mode) => Promise<void>;
  onPlace: (collectionId: string, title: string, mode: Mode) => Promise<void>;
}

function PlaceDialog({ kind, count, spaces, spaceId, onClose, onNew, onPlace }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const collections = useLiveQuery(() => listAllCollectionsInOrder(db)) ?? [];
  const [title, setTitle] = useState('');
  const [space, setSpace] = useState(spaceId ?? spaces[0]?.id ?? '');
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<Mode>(kind === 'copy' ? 'copy' : 'move');
  useEffect(() => ref.current?.showModal(), []);

  const what = plural(count, 'card');
  const heading = kind === 'new' ? `New collection from ${what}` : `${kind === 'move' ? 'Move' : 'Copy'} ${what} to…`;
  const ready = kind === 'new' ? !!space : !!target;

  return (
    <dialog ref={ref} className="select-dialog" aria-label={heading} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          if (kind === 'new') void onNew(space, title.trim() || 'New collection', mode);
          else void onPlace(target, collections.find((c) => c.id === target)?.title ?? '', mode);
        }}
      >
        <h3>{heading}</h3>
        {kind === 'new' ? (
          <>
            <label>
              Name
              <input autoFocus value={title} placeholder="New collection" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Space
              <select value={space} onChange={(e) => setSpace(e.target.value)}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="radios">
              <legend>The cards</legend>
              <label>
                <input type="radio" name="mode" checked={mode === 'move'} onChange={() => setMode('move')} /> Move them here (they leave their
                collections)
              </label>
              <label>
                <input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} /> Copy them here (they stay where
                they are too)
              </label>
            </fieldset>
          </>
        ) : (
          <label>
            Collection
            <select autoFocus value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="" disabled>
                Choose a collection…
              </option>
              {spaces.map((s) => (
                <optgroup key={s.id} label={s.name}>
                  {collections
                    .filter((c) => c.spaceId === s.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title || 'Untitled'}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <div className="row-end">
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!ready}>
            {kind === 'new' ? 'Create' : kind === 'move' ? 'Move' : 'Copy'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
