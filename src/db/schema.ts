// Every record carries sync metadata from day one so a sync server can be
// added later without migrating data: stable UUIDs, updatedAt for
// last-writer-wins, and deletedAt tombstones instead of hard deletes.
export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Space extends Base {
  name: string;
  /** Fractional-index key; sort ascending as strings. */
  position: string;
}

export interface Collection extends Base {
  spaceId: string;
  title: string;
  position: string;
  starred: boolean;
  collapsed: boolean;
  tagIds: string[];
  /** Set when the collection was saved from a Chrome tab group; reopening
   * recreates the group in this color. Absent on older records. */
  groupColor?: string | null;
  /** Set when the collection was saved from all windows at once; "Open all"
   * rebuilds those windows and their tab groups. Absent on older records. */
  session?: SessionLayout | null;
}

/** A saved window: its size and place on screen. */
export interface SessionWindow {
  state: 'normal' | 'maximized' | 'fullscreen' | 'minimized';
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  focused: boolean;
}

export interface SessionGroup {
  title: string;
  color: string;
  collapsed: boolean;
}

/** Windows and tab groups of a session; cards point into them by index (Card.layout). */
export interface SessionLayout {
  windows: SessionWindow[];
  groups: SessionGroup[];
}

export interface Card extends Base {
  collectionId: string;
  url: string;
  /** Page title captured when the tab was saved. */
  title: string;
  /** User override of the title; shown instead of `title` when set. */
  customTitle: string;
  note: string;
  /** Icon captured at save time (http URL or data URI). Rendering prefers Chrome's favicon cache. */
  favIconUrl: string;
  position: string;
  /** "to/<shortcut>" in the address bar opens this card. Lowercase; absent on older records. */
  shortcut?: string;
  /** Where the tab sat in its collection's session (Collection.session). Absent elsewhere. */
  layout?: CardLayout | null;
}

export interface CardLayout {
  window: number;
  group: number | null;
}

/** An entry in the Next queue: a page to get through, in order. */
export interface NextItem extends Base {
  /** The card it came from, if any (the queue keeps its own copy of url/title). */
  cardId: string | null;
  url: string;
  title: string;
  favIconUrl: string;
  position: string;
  doneAt: number | null;
}

export interface Tag extends Base {
  name: string;
  color: string;
}

export const displayTitle = (card: Pick<Card, 'customTitle' | 'title' | 'url'>) =>
  card.customTitle || card.title || card.url;
