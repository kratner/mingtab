// Update notices. MingTab isn't in the Chrome Web Store, so Chrome never updates
// it. Instead it checks GitHub Releases about once a day and says when a newer
// version exists. Chrome won't let an unpacked extension rewrite its own files,
// so the update itself is: download the zip, unzip it over the MingTab folder,
// then Restart MingTab. MingTab notices the newer files on disk (the folder's
// manifest.json is readable while the old version runs) and offers the restart.

export const RELEASES_URL: string =
  (import.meta.env.VITE_UPDATE_URL as string | undefined) || 'https://api.github.com/repos/kratner/mingtab/releases/latest';

export const UPDATE_KEY = 'mingtab.update';
export const SKIPPED_KEY = 'mingtab.update.skipped';
export const AUTO_KEY = 'mingtab.update.auto';
const DAY_MS = 86_400_000;

export interface Release {
  version: string;
  notesUrl: string;
  /** The release's mingtab-<version>.zip, when it has one. */
  zipUrl: string | null;
}

/** What the last check found, kept in chrome.storage.local. */
export interface UpdateState {
  checkedAt: number;
  latest: Release | null;
  /** Why the last check failed, e.g. the repository isn't public yet. */
  error?: string;
}

export type UpdateNotice =
  | { kind: 'restart'; version: string }
  | { kind: 'available'; release: Release }
  | { kind: 'none' };

/** True when version `a` is newer than `b` (x.y.z, optional leading "v"). */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('-')[0]!
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/** Reads the fields MingTab needs from GitHub's "latest release" response. */
export function parseRelease(json: unknown): Release {
  const r = json as { tag_name?: unknown; html_url?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] };
  if (typeof r?.tag_name !== 'string' || typeof r.html_url !== 'string') throw new Error('Unexpected reply from GitHub');
  const zip = (r.assets ?? []).find((a) => typeof a.name === 'string' && /^mingtab-.*\.zip$/.test(a.name));
  return {
    version: r.tag_name.replace(/^v/, ''),
    notesUrl: r.html_url,
    zipUrl: typeof zip?.browser_download_url === 'string' ? zip.browser_download_url : null,
  };
}

/**
 * Which notice to show. Newer files already on disk come first: the update is
 * downloaded and only a restart is left. A release the person skipped stays
 * quiet until a newer one comes out.
 */
export function decideNotice(opts: {
  running: string;
  disk: string | null;
  latest: Release | null;
  skipped: string | null;
}): UpdateNotice {
  const { running, disk, latest, skipped } = opts;
  if (disk && isNewer(disk, running)) return { kind: 'restart', version: disk };
  if (latest && isNewer(latest.version, running) && latest.version !== skipped) return { kind: 'available', release: latest };
  return { kind: 'none' };
}

export const runningVersion = () => chrome.runtime.getManifest().version;

/** The version in the MingTab folder right now, which can be newer than the one running. */
export async function diskVersion(): Promise<string | null> {
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    return ((await res.json()) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

export async function readUpdateState(): Promise<{ state: UpdateState | null; skipped: string | null; auto: boolean }> {
  const v = await chrome.storage.local.get([UPDATE_KEY, SKIPPED_KEY, AUTO_KEY]);
  return {
    state: (v[UPDATE_KEY] as UpdateState | undefined) ?? null,
    skipped: (v[SKIPPED_KEY] as string | undefined) ?? null,
    auto: (v[AUTO_KEY] as boolean | undefined) ?? true,
  };
}

/** Asks GitHub for the latest release and stores the answer. Never throws. */
export async function checkForUpdate(): Promise<UpdateState> {
  const prev = (await readUpdateState()).state;
  let state: UpdateState;
  try {
    const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? 'No public release found' : `GitHub replied ${res.status}`);
    state = { checkedAt: Date.now(), latest: parseRelease(await res.json()) };
  } catch (err) {
    // Keep what an earlier check found; just record why this one failed.
    state = { checkedAt: Date.now(), latest: prev?.latest ?? null, error: err instanceof Error ? err.message : String(err) };
  }
  await chrome.storage.local.set({ [UPDATE_KEY]: state });
  return state;
}

/** The daily check, when automatic checks are on and the last one is a day old. */
export async function checkIfDue(): Promise<void> {
  const { state, auto } = await readUpdateState();
  if (auto && (!state || Date.now() - state.checkedAt > DAY_MS)) await checkForUpdate();
}

export async function currentNotice(): Promise<UpdateNotice> {
  const [{ state, skipped }, disk] = await Promise.all([readUpdateState(), diskVersion()]);
  return decideNotice({ running: runningVersion(), disk, latest: state?.latest ?? null, skipped });
}
