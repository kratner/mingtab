import { useDroppable } from '@dnd-kit/core';
import { useState } from 'react';
import { db } from '../db/db';
import { createSpace, deleteSpace, renameSpace } from '../db/repo';
import type { Space } from '../db/schema';
import { dragId, type DragData } from '../dnd/drop';
import type { Surface } from './surface';

function SpaceLink({ space, selected, onSelect }: { space: Space; selected: boolean; onSelect: (id: string) => void }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: dragId.space(space.id), data: { type: 'space', space } });
  const type = (active?.data.current as DragData | undefined)?.type;
  const target = isOver && (type === 'collection' || type === 'card') && !selected;
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`space-link ${selected ? 'active' : ''} ${target ? 'drop-target' : ''}`}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onSelect(space.id)}
    >
      {space.name}
    </button>
  );
}

/** Pseudo-space id for the "Starred" view (starred collections from every space). */
export const STARRED = '__starred__';

interface Props {
  surface: Surface;
  spaces: Space[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SpaceNav({ surface, spaces, selectedId, onSelect }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const selected = spaces.find((s) => s.id === selectedId); // undefined for Starred

  const create = async () => {
    const n = name.trim();
    setCreating(false);
    setName('');
    if (n) onSelect((await createSpace(db, n)).id);
  };

  const rename = () => {
    if (!selected) return;
    const n = prompt('Rename space', selected.name)?.trim();
    if (n && n !== selected.name) void renameSpace(db, selected.id, n);
  };

  const remove = () => {
    if (selected && confirm(`Delete the space "${selected.name}" and everything in it?`)) void deleteSpace(db, selected.id);
  };

  const newSpaceForm = creating && (
    <form
      className="new-space"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <input
        autoFocus
        aria-label="New space name"
        placeholder="Space name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void create()}
        onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
      />
    </form>
  );

  const spaceActions = selected && (
    <>
      <button type="button" className="icon-btn" aria-label={`Rename ${selected.name}`} onClick={rename}>
        ✎
      </button>
      <button type="button" className="icon-btn danger" aria-label={`Delete ${selected.name}`} onClick={remove}>
        ✕
      </button>
    </>
  );

  if (surface === 'sidepanel') {
    return (
      <div className="space-select">
        <select aria-label="Space" value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
          <option value={STARRED}>★ Starred</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {spaceActions}
        <button type="button" className="icon-btn" aria-label="New space" onClick={() => setCreating(true)}>
          +
        </button>
        {newSpaceForm}
      </div>
    );
  }

  return (
    <nav className="sidebar" aria-label="Spaces">
      <div className="sidebar-head">
        <span>Spaces</span>
        <button type="button" className="icon-btn" aria-label="New space" onClick={() => setCreating(true)}>
          +
        </button>
      </div>
      <button
        type="button"
        className={`space-link starred-link ${selectedId === STARRED ? 'active' : ''}`}
        aria-current={selectedId === STARRED ? 'page' : undefined}
        onClick={() => onSelect(STARRED)}
      >
        ★ Starred
      </button>
      <ul>
        {spaces.map((s) => (
          <li key={s.id}>
            <SpaceLink space={s} selected={s.id === selectedId} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      {newSpaceForm}
      {selected && <div className="sidebar-actions">{spaceActions}</div>}
    </nav>
  );
}
