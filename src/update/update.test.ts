import { describe, expect, it } from 'vitest';
import { decideNotice, isNewer, parseRelease, type Release } from './update';

describe('isNewer', () => {
  it('compares x.y.z numerically, ignoring a leading v and pre-release tags', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v1.0.0', '0.99.0')).toBe(true);
    expect(isNewer('0.8.0', '0.8.0')).toBe(false);
    expect(isNewer('0.8', '0.8.1')).toBe(false);
    expect(isNewer('0.9.0-beta', '0.8.5')).toBe(true);
  });
});

describe('parseRelease', () => {
  const base = { tag_name: 'v0.9.0', html_url: 'https://github.com/kratner/mingtab/releases/tag/v0.9.0' };
  it('finds the mingtab zip among the assets', () => {
    const r = parseRelease({
      ...base,
      assets: [
        { name: 'NOTES.md', browser_download_url: 'https://x/NOTES.md' },
        { name: 'mingtab-0.9.0.zip', browser_download_url: 'https://x/mingtab-0.9.0.zip' },
      ],
    });
    expect(r).toEqual({ version: '0.9.0', notesUrl: base.html_url, zipUrl: 'https://x/mingtab-0.9.0.zip' });
  });
  it('has no zip link when the release has no zip', () => {
    expect(parseRelease({ ...base, assets: [] }).zipUrl).toBeNull();
  });
  it('rejects a reply that is not a release', () => {
    expect(() => parseRelease({ message: 'Not Found' })).toThrow();
  });
});

describe('decideNotice', () => {
  const latest: Release = { version: '0.9.0', notesUrl: 'n', zipUrl: 'z' };
  it('offers a newer release', () => {
    expect(decideNotice({ running: '0.8.0', disk: '0.8.0', latest, skipped: null })).toEqual({ kind: 'available', release: latest });
  });
  it('stays quiet when up to date, or when running a newer local build', () => {
    expect(decideNotice({ running: '0.9.0', disk: '0.9.0', latest, skipped: null }).kind).toBe('none');
    expect(decideNotice({ running: '0.10.0', disk: '0.10.0', latest, skipped: null }).kind).toBe('none');
  });
  it('stays quiet about a skipped version, but not about a newer one', () => {
    expect(decideNotice({ running: '0.8.0', disk: '0.8.0', latest, skipped: '0.9.0' }).kind).toBe('none');
    expect(decideNotice({ running: '0.8.0', disk: '0.8.0', latest: { ...latest, version: '0.9.1' }, skipped: '0.9.0' }).kind).toBe(
      'available',
    );
  });
  it('asks for a restart once newer files are on disk, even if a release is also newer', () => {
    expect(decideNotice({ running: '0.8.0', disk: '0.9.0', latest: { ...latest, version: '0.9.1' }, skipped: null })).toEqual({
      kind: 'restart',
      version: '0.9.0',
    });
  });
  it('ignores an unreadable manifest', () => {
    expect(decideNotice({ running: '0.8.0', disk: null, latest: null, skipped: null }).kind).toBe('none');
  });
});
