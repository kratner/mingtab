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
import { isSameTabPlace } from '../tabs/tabs';
import { ACCEPTS, dragId, edgeFor, handleDrop, type DragData, type DropData, type Edge } from './drop';

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

/** dnd-kit adds the card's place in its list to `data` (useSortable). */
interface Sortable {
  sortable?: { containerId: string | number; index: number; items: (string | number)[] };
}

/**
 * Where a drop would land for a drag event, or null when it wouldn't be a card or tab landing in a collection, or
 * would leave a card where it is (no line is drawn, and the drop does nothing).
 */
function indicatorFor(e: DragMoveEvent): DropIndicator | null {
  const active = e.active.data.current as (DragData & Sortable) | undefined;
  const over = e.over;
  const target = over?.data.current as (DropData & Sortable) | undefined;
  if (!over || !target || (active?.type !== 'card' && active?.type !== 'tab')) return null;
  const from = active.type === 'card' ? active.sortable : undefined;
  if (target.type === 'collection') {
    // Its own collection's header: to the end, unless it's already last.
    if (active.type === 'card' && active.card.collectionId === target.collection.id && from) {
      if (from.index === from.items.length - 1) return null;
    }
    return { over: String(over.id), edge: 'after' };
  }
  // Pointer drags follow the pointer; the keyboard moves the item's centre onto the target.
  const start = e.activatorEvent as Partial<PointerEvent> | null;
  const box = e.active.rect.current.translated;
  const y =
    typeof start?.clientY === 'number' ? start.clientY + e.delta.y : box ? box.top + box.height / 2 : over.rect.top;
  if (target.type === 'openTab') {
    // An open tab among the open tabs: reorder it in Chrome (any window).
    if (active.type !== 'tab' || active.tab.id === target.tab.id) return null;
    const initial = e.active.rect.current.initial;
    const edge = edgeFor(y, over.rect, initial && initial.top < over.rect.top ? 'after' : 'before');
    const { tab } = active;
    if (
      tab.index !== undefined &&
      tab.windowId !== undefined &&
      target.tab.index !== undefined &&
      target.tab.windowId !== undefined &&
      isSameTabPlace({ index: tab.index, windowId: tab.windowId }, { index: target.tab.index, windowId: target.tab.windowId }, edge)
    )
      return null;
    return { over: String(over.id), edge };
  }
  if (target.type !== 'card') return null;
  // Dead centre: within its own list moving down lands after (as sortable lists do); otherwise before.
  const initial = e.active.rect.current.initial;
  const sameList = active.type === 'card' && active.card.collectionId === target.card.collectionId;
  const tie: Edge = sameList && initial && initial.top < over.rect.top ? 'after' : 'before';
  const edge = edgeFor(y, over.rect, tie);
  // Just above or below itself: the card stays where it is.
  if (sameList && from && target.sortable) {
    const gap = target.sortable.index + (edge === 'after' ? 1 : 0);
    if (gap === from.index || gap === from.index + 1) return null;
  }
  return { over: String(over.id), edge };
}

/**
 * The same gap can be "after one card" or "before the next"; draw it on the next card's top edge either way, so the
 * line doesn't flicker between two spots a few pixels apart as the pointer crosses the gap.
 */
function shown(line: DropIndicator | null, over: DragMoveEvent['over']): DropIndicator | null {
  const items = (over?.data.current as Sortable | undefined)?.sortable?.items;
  if (!line || line.edge !== 'after' || !items) return line;
  const next = items[items.indexOf(line.over) + 1];
  return next === undefined ? line : { over: String(next), edge: 'before' };
}

/**
 * Only targets the dragged type accepts are considered. With a pointer, the
 * innermost accepted target under it wins (a card beats the collection that
 * contains it); with the keyboard, the closest accepted target.
 */
const collision: CollisionDetection = (args) => {
  const data = args.active.data.current as DragData | undefined;
  const type = data?.type;
  if (!type) return [];
  // A tab that can't be saved (a new-tab or MingTab page) can only be reordered among the open tabs.
  const accepts = data.type === 'tab' && data.savable === false ? (['openTab'] as DropData['type'][]) : ACCEPTS[type];
  // An open tab's row is both the drag source (`tab:…`) and a drop target (`opentab:…`): never itself.
  const self = data.type === 'tab' && data.tab.id !== undefined ? dragId.openTab(data.tab.id) : null;
  const droppableContainers = args.droppableContainers.filter(
    (c) =>
      c.id !== args.active.id &&
      c.id !== self &&
      accepts.includes((c.data.current as DropData | undefined)?.type as DropData['type']),
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
  const best = hits.sort((x, y) => rank(x.id) - rank(y.id)).slice(0, 1);
  return type === 'card' || type === 'tab' ? snapToCard(args, best) : best;
};

/**
 * A card or tab over a collection's list (its own slot, a gap between cards, or the space under the last card)
 * goes to the nearest card, so the line sits next to a card rather than jumping to the end. Over the collection's
 * header it stays on the collection (append). The dragged card itself is nearest over its own slot: no target.
 */
function snapToCard(args: Parameters<CollisionDetection>[0], best: ReturnType<CollisionDetection>) {
  const hit = best[0];
  const target = hit?.data?.droppableContainer?.data.current as DropData | undefined;
  const y = args.pointerCoordinates?.y;
  if (!hit || target?.type !== 'collection' || y === undefined) return best;
  const cards = args.droppableContainers
    .filter((c) => {
      const d = c.data.current as DropData | undefined;
      return d?.type === 'card' && d.card.collectionId === target.collection.id;
    })
    .map((c) => ({ c, rect: args.droppableRects.get(c.id) }))
    .filter((x): x is { c: (typeof args.droppableContainers)[number]; rect: NonNullable<typeof x.rect> } => !!x.rect);
  if (cards.length === 0 || y < Math.min(...cards.map((x) => x.rect.top))) return best;
  const gap = (r: { top: number; bottom: number }) => (y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0);
  const nearest = cards.reduce((a, b) => (gap(b.rect) < gap(a.rect) ? b : a));
  if (nearest.c.id === args.active.id) return [];
  return [{ id: nearest.c.id, data: { droppableContainer: nearest.c, value: gap(nearest.rect) } }];
}

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
  // indicatorRef is where the drop lands; `indicator` is where the line is drawn (see `shown`).
  const track = (e: DragMoveEvent) => {
    const next = indicatorFor(e);
    indicatorRef.current = next;
    const line = shown(next, e.over);
    setIndicator((prev) => (prev?.over === line?.over && prev?.edge === line?.edge ? prev : line));
  };
  const clearIndicator = () => {
    indicatorRef.current = null;
    setIndicator(null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    // Land where the line was drawn (recomputed for the final position, in case no move event followed).
    const line = e.over ? indicatorFor(e) : indicatorRef.current;
    clearIndicator();
    const active = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as DropData | undefined;
    // No line means the drop would leave things as they are (or isn't a card or tab landing in a collection).
    if (!active || !over) return;
    if (
      (active.type === 'card' || active.type === 'tab') &&
      (over.type === 'card' || over.type === 'collection' || over.type === 'openTab') &&
      !line
    )
      return;
    const edge = line && line.over === String(e.over!.id) && (over.type === 'card' || over.type === 'openTab') ? line.edge : null;
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
