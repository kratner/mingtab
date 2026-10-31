import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Undo } from './actions';

// Select mode: checkboxes on saved tabs, wherever they're shown (a space, Starred,
// search results), and an action bar for what's chosen. The selection lives here,
// above the views, so it survives switching spaces and searching.

export interface Notice {
  text: string;
  undo?: Undo;
}

interface SelectionState {
  active: boolean;
  ids: ReadonlySet<string>;
  start: () => void;
  stop: () => void;
  /** Ticks or unticks one card; with shift, everything shown between it and the last one clicked. */
  toggle: (id: string, on: boolean, shift?: boolean) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
  notice: Notice | null;
  notify: (n: Notice | null) => void;
}

const Ctx = createContext<SelectionState | null>(null);

export const useSelection = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSelection outside SelectionProvider');
  return s;
};

/** Ids of the selectable cards on screen, in the order they're shown. */
const shownIds = () => [...document.querySelectorAll<HTMLElement>('[data-select-id]')].map((e) => e.dataset.selectId!);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const last = useRef<string | null>(null);

  const stop = useCallback(() => {
    setActive(false);
    setIds(new Set());
    last.current = null;
  }, []);

  const toggle = useCallback((id: string, on: boolean, shift = false) => {
    // Worked out now, not in the updater, which React may run after `last` moves on.
    const order = shownIds();
    const [a, b] = [last.current ? order.indexOf(last.current) : -1, order.indexOf(id)];
    const range = shift && a >= 0 && b >= 0 ? order.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
    setIds((prev) => {
      const next = new Set(prev);
      for (const x of range) {
        if (on) next.add(x);
        else next.delete(x);
      }
      return next;
    });
    last.current = id;
  }, []);

  const setMany = useCallback((list: string[], on: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      for (const x of list) {
        if (on) next.add(x);
        else next.delete(x);
      }
      return next;
    });
  }, []);

  // Esc leaves select mode, unless a dialog is open (Esc closes that first).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]') && !(e.target as HTMLElement).closest('input, textarea')) stop();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [active, stop]);

  // A notice stays a while: long enough to reach Undo.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const value = useMemo<SelectionState>(
    () => ({
      active,
      ids,
      start: () => setActive(true),
      stop,
      toggle,
      setMany,
      clear: () => setIds(new Set()),
      notice,
      notify: setNotice,
    }),
    [active, ids, stop, toggle, setMany, notice],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The checkbox on one card. */
export function SelectBox({ id, label }: { id: string; label: string }) {
  const { ids, toggle } = useSelection();
  const on = ids.has(id);
  return (
    <input
      type="checkbox"
      className="select-box"
      data-select-id={id}
      checked={on}
      aria-label={`Select ${label}`}
      onChange={() => {}}
      onClick={(e) => toggle(id, !on, e.shiftKey)}
    />
  );
}

/** The checkbox on a group (a collection, a block of search results): ticks all of it, or clears all of it. */
export function GroupBox({ ids: group, label }: { ids: string[]; label: string }) {
  const { ids, setMany } = useSelection();
  const n = group.filter((id) => ids.has(id)).length;
  const all = group.length > 0 && n === group.length;
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = n > 0 && !all;
  }, [n, all]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="select-box group-box"
      checked={all}
      disabled={group.length === 0}
      aria-label={`Select all in ${label}`}
      onChange={() => setMany(group, !all)}
    />
  );
}
