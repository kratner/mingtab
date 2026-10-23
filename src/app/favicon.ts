// Chrome's own favicon cache (needs the "favicon" permission). It knows any
// site in the browser history; the icon Toby/MingTab captured at save time is
// the fallback.
export function chromeFaviconUrl(pageUrl: string, size = 32): string | null {
  if (!/^https?:/i.test(pageUrl) || typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
