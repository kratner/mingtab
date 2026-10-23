import Dexie, { type EntityTable } from 'dexie';
import type { Card, Collection, NextItem, Space, Tag } from './schema';

export class MingTabDB extends Dexie {
  spaces!: EntityTable<Space, 'id'>;
  collections!: EntityTable<Collection, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  next!: EntityTable<NextItem, 'id'>;

  constructor(name = 'mingtab') {
    super(name);
    this.version(1).stores({
      spaces: 'id, position, updatedAt',
      collections: 'id, spaceId, [spaceId+position], updatedAt',
      cards: 'id, collectionId, [collectionId+position], url, updatedAt',
      tags: 'id, name, updatedAt',
    });
    // M5: the Next queue.
    this.version(2).stores({
      next: 'id, position, updatedAt',
    });
  }
}

export const db = new MingTabDB();
