import sync from '../../sync.config.json';

export const SYNC_URL: string = (import.meta.env.VITE_SYNC_URL as string | undefined) || sync.syncUrl;
export const GOOGLE_CLIENT_ID: string = sync.googleClientId;
