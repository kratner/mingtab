import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './address';

describe('normalizeUrl', () => {
  it('keeps full addresses and adds https:// to a bare domain', () => {
    expect(normalizeUrl('https://www.imdb.com/title/tt0111161/')).toBe('https://www.imdb.com/title/tt0111161/');
    expect(normalizeUrl('  imdb.com ')).toBe('https://imdb.com/');
    expect(normalizeUrl('http://localhost:5173/x')).toBe('http://localhost:5173/x');
  });
  it('refuses things that are not addresses', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('imdb')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});
