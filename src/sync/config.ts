import sync from '../../sync.config.json';

export const SYNC_URL: string = (import.meta.env.VITE_SYNC_URL as string | undefined) || sync.syncUrl;
export const GOOGLE_CLIENT_ID: string = sync.googleClientId;

/** Google Drive API host. Tests point it at a local fake (VITE_DRIVE_URL). */
export const DRIVE_URL: string = (import.meta.env.VITE_DRIVE_URL as string | undefined) || 'https://www.googleapis.com';
/** Google's OAuth endpoint. Tests point it at the same fake (VITE_GOOGLE_AUTH_URL). */
export const GOOGLE_AUTH_URL: string =
  (import.meta.env.VITE_GOOGLE_AUTH_URL as string | undefined) || 'https://accounts.google.com/o/oauth2/v2/auth';
/** The only Drive scope MingTab asks for: its own hidden app folder, nothing else in your Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
