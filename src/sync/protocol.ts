// Wire format shared with the sync Worker (worker/src/sync.ts). Keep in step.

export const SYNC_TABLES = ['spaces', 'collections', 'cards', 'tags', 'next'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface Change {
  table: SyncTable;
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  data: Record<string, unknown> & { id: string };
}

export interface SyncRequest {
  cursor: number;
  changes: Change[];
}

export interface SyncResponse {
  cursor: number;
  changes: Change[];
  hasMore: boolean;
  accepted: number;
}

/** The Worker's limit (D1 free plan: 50 queries per request). */
export const MAX_CHANGES_PER_REQUEST = 40;

export interface Transport {
  sync(req: SyncRequest): Promise<SyncResponse>;
}
