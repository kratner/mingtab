// A fake Google Drive (appDataFolder only) plus a fake Google OAuth endpoint,
// for tests. Vitest calls `fake.fetch` directly; e2e serves `fake.handle`
// over HTTP (e2e/drive-sync.spec.ts). Follows the real API's shapes for the
// calls MingTab makes: files.list, get?alt=media, multipart / media /
// resumable uploads, delete; and the implicit-grant redirect.

interface StoredFile {
  id: string;
  name: string;
  version: number;
  modifiedTime: string;
  appProperties: Record<string, string>;
  content: string;
  /** Which account's app folder it's in. */
  owner: string;
}

export interface FakeDriveOptions {
  /** Base URL the fake is reached at (used in resumable-upload Location headers). */
  baseUrl?: string;
  /** Milliseconds to wait before answering each request (lets concurrent syncs interleave). */
  latency?: number;
}

const FIELDS = ['id', 'name', 'version', 'modifiedTime', 'appProperties'] as const;

export class FakeDrive {
  files = new Map<string, StoredFile>();
  /** access token → email */
  tokens = new Map<string, string>();
  /** Every request, as "METHOD /path?uploadType" for assertions. */
  log: string[] = [];
  /** Email the fake OAuth endpoint signs in as. */
  email = 'tester@example.com';
  /** When true, prompt=none (silent renewal) fails with interaction_required. */
  denySilent = false;
  /** When false, the consent result leaves out the Drive scope (the person unticked it). */
  grantDrive = true;
  baseUrl: string;
  latency: number;
  private seq = 0;
  private uploads = new Map<string, { method: string; fileId?: string; meta: Record<string, unknown>; owner: string }>();

  constructor(opts: FakeDriveOptions = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://drive.fake';
    this.latency = opts.latency ?? 0;
  }

  /** Issue a token directly (unit tests skip the OAuth redirect). */
  issueToken(email = this.email) {
    const t = `tok-${++this.seq}-${Math.random().toString(36).slice(2)}`;
    this.tokens.set(t, email);
    return t;
  }

  expireAllTokens() {
    this.tokens.clear();
  }

  filesOf(email = this.email) {
    return [...this.files.values()].filter((f) => f.owner === email);
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    return this.handle(req);
  };

  async handle(req: Request): Promise<Response> {
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency));
    const url = new URL(req.url);
    this.log.push(`${req.method} ${url.pathname}${url.searchParams.get('uploadType') ? `?${url.searchParams.get('uploadType')}` : ''}`);
    if (url.pathname === '/o/oauth2/v2/auth') return this.authorize(url);

    const owner = this.tokens.get((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
    if (!owner) return err(401, 'Invalid Credentials', 'authError');

    const m = url.pathname.match(/^(\/upload)?\/drive\/v3\/files(?:\/([^/]+))?$/);
    if (!m) return err(404, 'Not found', 'notFound');
    const upload = !!m[1];
    const id = m[2] ? decodeURIComponent(m[2]) : undefined;
    const uploadType = url.searchParams.get('uploadType');
    const uploadId = url.searchParams.get('upload_id');

    if (upload && uploadId && req.method === 'PUT') return this.finishResumable(uploadId, await req.text());
    if (!id && req.method === 'GET' && !upload) return this.list(url, owner);

    const file = id ? this.files.get(id) : undefined;
    if (id && (!file || file.owner !== owner)) return err(404, `File not found: ${id}.`, 'notFound');

    if (req.method === 'GET' && file) {
      if (url.searchParams.get('alt') !== 'media') return json(view(file));
      return new Response(file.content, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (req.method === 'DELETE' && file) {
      this.files.delete(file.id);
      return new Response(null, { status: 204 });
    }
    if (req.method === 'PATCH' && file && !upload) {
      const meta = (await req.json()) as { appProperties?: Record<string, string> };
      this.touch(file, undefined, meta.appProperties);
      return json(view(file));
    }
    if (upload && uploadType === 'resumable') {
      const meta = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const key = `up-${++this.seq}`;
      this.uploads.set(key, { method: req.method, fileId: file?.id, meta, owner });
      return new Response(null, {
        status: 200,
        headers: { location: `${this.baseUrl}/upload/drive/v3/files?uploadType=resumable&upload_id=${key}` },
      });
    }
    if (upload && req.method === 'POST' && uploadType === 'multipart') {
      const { meta, content } = parseMultipart(req.headers.get('content-type') ?? '', await req.text());
      return json(view(this.createFile(owner, meta, content)));
    }
    if (upload && req.method === 'PATCH' && file && uploadType === 'media') {
      this.touch(file, await req.text());
      return json(view(file));
    }
    return err(400, `Unsupported request ${req.method} ${url.pathname}`, 'badRequest');
  }

  private list(url: URL, owner: string) {
    if (url.searchParams.get('spaces') !== 'appDataFolder') return err(403, 'This fake only serves appDataFolder', 'forbidden');
    const all = this.filesOf(owner).sort((a, b) => a.id.localeCompare(b.id));
    const size = Number(url.searchParams.get('pageSize') ?? 100);
    const start = Number(url.searchParams.get('pageToken') ?? 0);
    const page = all.slice(start, start + size);
    return json({
      files: page.map(view),
      ...(start + size < all.length ? { nextPageToken: String(start + size) } : {}),
    });
  }

  private createFile(owner: string, meta: Record<string, unknown>, content: string) {
    const parents = meta.parents as string[] | undefined;
    if (!parents?.includes('appDataFolder')) throw new Error('fake drive: files must be created in appDataFolder');
    const f: StoredFile = {
      id: `file-${++this.seq}`,
      name: String(meta.name ?? 'Untitled'),
      version: 1,
      modifiedTime: new Date().toISOString(),
      appProperties: (meta.appProperties as Record<string, string>) ?? {},
      content,
      owner,
    };
    this.files.set(f.id, f);
    return f;
  }

  private touch(f: StoredFile, content?: string, appProperties?: Record<string, string>) {
    if (content !== undefined) f.content = content;
    if (appProperties) f.appProperties = { ...f.appProperties, ...appProperties };
    f.version++;
    f.modifiedTime = new Date().toISOString();
  }

  private finishResumable(key: string, content: string) {
    const up = this.uploads.get(key);
    if (!up) return err(404, 'Upload session not found', 'notFound');
    this.uploads.delete(key);
    if (up.fileId) {
      const f = this.files.get(up.fileId);
      if (!f) return err(404, 'File not found', 'notFound');
      this.touch(f, content, up.meta.appProperties as Record<string, string> | undefined);
      return json(view(f));
    }
    return json(view(this.createFile(up.owner, up.meta, content)));
  }

  /** Implicit grant: redirect straight back with a token (no consent page). */
  private authorize(url: URL) {
    const redirect = url.searchParams.get('redirect_uri') ?? '';
    const back = (params: Record<string, string>) =>
      new Response(null, { status: 302, headers: { location: `${redirect}#${new URLSearchParams(params)}` } });
    if (url.searchParams.get('prompt') === 'none' && this.denySilent) return back({ error: 'interaction_required' });
    const scopes = (url.searchParams.get('scope') ?? '').split(' ').filter((s) => this.grantDrive || !s.includes('drive'));
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const idToken = `${b64({ alg: 'none' })}.${b64({ email: this.email, nonce: url.searchParams.get('nonce') })}.`;
    return back({
      access_token: this.issueToken(),
      token_type: 'Bearer',
      expires_in: '3599',
      scope: scopes.join(' '),
      id_token: idToken,
      ...(url.searchParams.get('state') ? { state: url.searchParams.get('state')! } : {}),
    });
  }
}

function view(f: StoredFile) {
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) out[k] = k === 'version' ? String(f.version) : f[k];
  return out;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const err = (status: number, message: string, reason: string) =>
  json({ error: { code: status, message, errors: [{ reason, message }] } }, status);

function parseMultipart(contentType: string, body: string) {
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) throw new Error('fake drive: multipart without boundary');
  const parts = body
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((p) => p.replace(/^\r\n/, '').replace(/\r\n$/, ''))
    .map((p) => p.slice(p.indexOf('\r\n\r\n') + 4));
  return { meta: JSON.parse(parts[0] ?? '{}') as Record<string, unknown>, content: parts[1] ?? '' };
}
