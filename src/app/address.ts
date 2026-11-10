/** A saved tab's address as typed in the edit form: a full URL, or a bare domain (https:// is added). Null if it isn't one. */
export function normalizeUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    // "imdb" alone isn't an address (it would become https://imdb/).
    if ((u.protocol === 'http:' || u.protocol === 'https:') && !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}
