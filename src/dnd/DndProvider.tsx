import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useRef, useState, type ReactNode } from 'react';
import { db } from '../db/db';
import { displayTitle } from '../db/schema';
import { ACCEPTS, handleDrop, type DragData, type DropData } from './drop';

/**
 * Only targets the dragged type accepts are considered. With a pointer, the
 * innermost accepted target under it wins (a card beats the collection that
 * contains it); with the keyboard, the closest accepted target.
 */
const collision: CollisionDetection = (args) => {
  const type = (args.active.data.current as DragData | undefined)?.type;
  if (!type) return [];
  const accepts = ACCEPTS[type];
  const droppableContainers = args.droppableContainers.filter(
    (c) => c.id !== args.active.id && accepts.includes((c.data.current as DropData | undefined)?.type as DropData['type']),
  );
  if (!args.pointerCoordinates) return closestCenter({ ...args, droppableContainers });
  const hits = pointerWithin({ ...args, droppableContainers });
  const rank = (id: string | number) =>
    accepts.indexOf((droppableContainers.find((c) => c.id === id)?.data.current as DropData).type);
  return hits.sort((x, y) => rank(x.id) - rank(y.id)).slice(0, 1);
};

/**
 * Arrow keys move to the nearest droppable in that direction. Show the stock
 * sortable logic only the targets this drag accepts; otherwise a collection
 * being moved down "lands" on a card inside the next collection.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const type = (args.context.active?.data.current as DragData | undefined)?.type;
  if (!type) return sortableKeyboardCoordinates(event, args);
  const all = args.context.droppableContainers;
  const accepted = new AcceptedContainers(
    [...all.values()].filter((c) => ACCEPTS[type].includes((c.data.current as DropData | undefined)?.type as DropData['type'])),
  );
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...args.context, droppableContainers: accepted as unknown as typeof all },
  });
};

/** Same shape as dnd-kit's DroppableContainersMap, over a filtered set. */
class AcceptedContainers extends Map<string | number, Parameters<CollisionDetection>[0]['droppableContainers'][number]> {
  constructor(entries: Parameters<CollisionDetection>[0]['droppableContainers']) {
    super(entries.map((e) => [e.id, e]));
  }
  getEnabled() {
    return [...this.values()].filter((c) => !c.disabled);
  }
  getNodeFor(id: string | number) {
    return this.get(id)?.node.current ?? undefined;
  }
}

function label(d: DragData) {
  if (d.type === 'collection') return d.collection.title;
  if (d.type === 'card') return displayTitle(d.card);
  if (d.type === 'next') return d.item.title;
  return d.tab.title || d.tab.url || 'Tab';
}

export function DndProvider({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    // A 6px threshold keeps plain clicks (open link, focus tab, buttons) working.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const active = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as DropData | undefined;
    if (!active || !over) return;
    const result = await handleDrop(db, active, over);
    if (result) {
      setMessage(result);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(''), 3000);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current as DragData) ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragging && <div className={`drag-overlay drag-${dragging.type}`}>{label(dragging)}</div>}
      </DragOverlay>
      {message && (
        <div className="toast" role="status" aria-label="Drag and drop">
          {message}
        </div>
      )}
    </DndContext>
  );
}
