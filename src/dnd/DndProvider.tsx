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
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { db } from '../db/db';
import { displayTitle } from '../db/schema';
import { ACCEPTS, edgeFor, handleDrop, type DragData, type DropData, type Edge } from './drop';

/**
 * Where the dragged card or tab will land, for the drop line: `over` is the droppable id (`card:…` or
 * `collection:…`); on a collection the line is drawn after its last card.
 */
export interface DropIndicator {
  over: string;
  edge: Edge;
}

const IndicatorContext = createContext<DropIndicator | null>(null);
export const useDropIndicator = () => useContext(IndicatorContext);

/** The drop line for a drag event, or null when the drop isn't a card or tab landing in a collection. */
function indicatorFor(e: DragMoveEvent): DropIndicator | null {
  const active = e.active.data.current as DragData | undefined;
  const over = e.over;
  const target = over?.data.current as DropData | undefined;
  if (!over || !target || (active?.type !== 'card' && active?.type !== 'tab')) return null;
  if (target.type === 'collection') return { over: String(over.id), edge: 'after' };
  if (target.type !== 'card') return null;
  // Pointer drags follow the pointer; the keyboard moves the item's centre onto the target.
  const start = e.activatorEvent as Partial<PointerEvent> | null;
  const box = e.active.rect.current.translated;
  const y =
    typeof start?.clientY === 'number' ? start.clientY + e.delta.y : box ? box.top + box.height / 2 : over.rect.top;
  // Dead centre: within its own list moving down lands after (as sortable lists do); otherwise before.
  const initial = e.active.rect.current.initial;
  const sameList = active.type === 'card' && active.card.collectionId === target.card.collectionId;
  const tie: Edge = sameList && initial && initial.top < over.rect.top ? 'after' : 'before';
  return { over: String(over.id), edge: edgeFor(y, over.rect, tie) };
}

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
  if (!args.pointerCoordinates) {
    // Keyboard: never the dragged card's own collection, whose box surrounds it and is always "closest".
    const self = args.droppableContainers.find((c) => c.id === args.active.id)?.node.current;
    const around = droppableContainers.filter((c) => !(self && c.node.current?.contains(self)));
    return closestCenter({ ...args, droppableContainers: around });
  }
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
  const self = args.context.activeNode;
  const accepted = new AcceptedContainers(
    [...all.values()].filter(
      (c) =>
        ACCEPTS[type].includes((c.data.current as DropData | undefined)?.type as DropData['type']) &&
        // Not the collection around the dragged card: arrow keys should step to the next card.
        !(self && c.node.current !== self && c.node.current?.contains(self)),
    ),
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
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const indicatorRef = useRef<DropIndicator | null>(null);

  // Runs on every pointer move: only re-render when the line actually moves.
  const track = (e: DragMoveEvent) => {
    const next = indicatorFor(e);
    const prev = indicatorRef.current;
    if (prev?.over === next?.over && prev?.edge === next?.edge) return;
    indicatorRef.current = next;
    setIndicator(next);
  };
  const clearIndicator = () => {
    indicatorRef.current = null;
    setIndicator(null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    // Land where the line was drawn (recomputed for the final position, in case no move event followed).
    const line = indicatorFor(e) ?? indicatorRef.current;
    clearIndicator();
    const active = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as DropData | undefined;
    if (!active || !over) return;
    const edge = line && line.over === String(e.over!.id) && over.type === 'card' ? line.edge : null;
    const result = await handleDrop(db, active, over, edge);
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
      onDragMove={track}
      onDragOver={track}
      onDragCancel={() => {
        setDragging(null);
        clearIndicator();
      }}
      onDragEnd={onDragEnd}
    >
      <IndicatorContext.Provider value={indicator}>{children}</IndicatorContext.Provider>
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
