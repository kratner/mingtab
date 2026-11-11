// Minimal Google Drive v3 client for the hidden app folder (appDataFolder).
// Only what sync needs: list, download, create, update, delete. Every call
// carries the access token; a 401 asks for a fresh token once and retries.

export interface DriveFile {
  id: string;
  name: string;
  /** Drive's per-file version: goes up on every change to the file. */
  version: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

/** Access was refused even with a fresh token: the person must reconnect. */
export class DriveAuthError extends Error {}

export interface DriveClientOptions {
  /** e.g. https://www.googleapis.com */
  baseUrl: string;
  /** Returns an access token; `fresh` asks for a new one (the current one was rejected). */
  getToken: (fresh: boolean) => Promise<string>;
  fetch?: typeof fetch;
  /** Above this many bytes, uploads use Drive's resumable protocol (simple uploads cap at 5 MB). */
  simpleUploadLimit?: number;
}

const FIELDS = 'id,name,version,modifiedTime,appProperties';
export const SIMPLE_UPLOAD_LIMIT = 5 * 1024 * 1024;

export class DriveClient {
  /** Requests made, for tests and request budgeting. */
  requests = 0;
  private readonly fetch: typeof fetch;
  private readonly limit: number;

  constructor(private readonly opts: DriveClientOptions) {
    this.fetch = opts.fetch ?? ((...a) => fetch(...a));
    this.limit = opts.simpleUploadLimit ?? SIMPLE_UPLOAD_LIMIT;
  }

  private async request(path: string, init: RequestInit = {}, absolute = false): Promise<Response> {
    const url = absolute ? path : `${this.opts.baseUrl}${path}`;
    let fresh = false;
    for (;;) {
      let token: string;
      try {
        token = await this.opts.getToken(fresh);
      } catch (e) {
        throw e instanceof DriveAuthError ? e : new DriveAuthError((e as Error).message);
      }
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${token}`);
      this.requests++;
      const res = await this.fetch(url, { ...init, headers });
      if (res.status === 401 && !fresh) {
        fresh = true;
        continue;
      }
      if (res.status === 401) throw new DriveAuthError('Google Drive refused the sign-in.');
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
        const reason = body.error?.errors?.[0]?.reason;
        const msg = body.error?.message ?? `Google Drive error (${res.status})`;
        throw new DriveError(msg, res.status, reason);
      }
      return res;
    }
  }

  /** Every file in the app folder (MingTab's own; no other app or file can be seen). */
  async list(): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000', fields: `nextPageToken,files(${FIELDS})` });
      if (pageToken) q.set('pageToken', pageToken);
      const res = await this.request(`/drive/v3/files?${q}`);
      const body = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
      out.push(...(body.files ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return out;
  }

  async download(id: string): Promise<string> {
    const res = await this.request(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
    return res.text();
  }

  async create(name: string, content: string, appProperties: Record<string, string> = {}): Promise<DriveFile> {
    const meta = { name, parents: ['appDataFolder'], mimeType: 'application/json', appProperties };
    if (byteLength(content) > this.limit) return this.resumable('POST', '/upload/drive/v3/files', meta, content);
    const boundary = `mingtab-${crypto.randomUUID()}`;
    const body =
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\ncontent-type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const res = await this.request(`/upload/drive/v3/files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.json() as Promise<DriveFile>;
  }

  async update(id: string, content: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    const path = `/upload/drive/v3/files/${encodeURIComponent(id)}`;
    if (byteLength(content) > this.limit) return this.resumable('PATCH', path, appProperties ? { appProperties } : {}, content);
    if (appProperties) {
      await this.request(`/drive/v3/files/${encodeURIComponent(id)}?fields=id`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appProperties }),
      });
    }
    const res = await this.request(`${path}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: content,
    });
    return res.json() as Promise<DriveFile>;
  }

  async remove(id: string): Promise<void> {
    try {
      await this.request(`/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      if (!(e instanceof DriveError && e.status === 404)) throw e;
    }
  }

  private async resumable(method: 'POST' | 'PATCH', path: string, meta: object, content: string): Promise<DriveFile> {
    const start = await this.request(`${path}?uploadType=resumable&fields=${FIELDS}`, {
      method,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'application/json' },
      body: JSON.stringify(meta),
    });
    const location = start.headers.get('location');
    if (!location) throw new DriveError('Google Drive did not start the upload.', 500);
    const res = await this.request(location, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: content }, true);
    return res.json() as Promise<DriveFile>;
  }
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;
