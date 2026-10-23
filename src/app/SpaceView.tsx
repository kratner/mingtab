import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { createCollection, listCollections } from '../db/repo';
import type { Space } from '../db/schema';
import { CollectionPanel } from './CollectionPanel';

export function SpaceView({ space }: { space: Space }) {
  const collections = useLiveQuery(() => listCollections(db, space.id), [space.id]);
  const [newId, setNewId] = useState<string | null>(null);

  const add = async () => {
    const c = await createCollection(db, space.id, 'New collection');
    setNewId(c.id);
  };

  if (!collections) return null;
  return (
    <div className="space-view">
      <div className="space-toolbar">
        <h2>{space.name}</h2>
        <span className="muted">
          {collections.length} collection{collections.length === 1 ? '' : 's'}
        </span>
        <button type="button" className="primary" onClick={add}>
          + Collection
        </button>
      </div>
      {collections.length === 0 ? (
        <p className="empty">This space is empty. Add a collection to start.</p>
      ) : (
        <div className="collections">
          {collections.map((c) => (
            <CollectionPanel key={c.id} collection={c} isNew={c.id === newId} />
          ))}
        </div>
      )}
    </div>
  );
}
