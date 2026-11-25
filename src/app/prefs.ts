import { useEffect, useState } from 'react';

// Per-device UI preferences. localStorage is shared by the side panel and the
// new-tab page (same extension origin) and survives restarts.

export type Theme = 'system' | 'light' | 'dark';
export type Scheme = 'four-ounces' | 'terracotta';
export type SortMode = 'custom' | 'az' | 'za' | 'newest' | 'oldest';
export type Density = 'comfortable' | 'compact';

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    // Keep the side panel and an open new tab in step.
    const onStorage = (e: StorageEvent) => e.key === key && setValue(read(key, fallback));
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, [key, fallback]);
  const set = (v: T) => {
    try {
      localStorage.setItem(key, v);
    } catch {
      /* private mode etc. — keep in memory only */
    }
    setValue(v);
  };
  return [value, set];
}

export type Corners = 'rounded' | 'square';

/** Text size as a percent of the sizes written in app.css. */
export const TEXT_SIZE = { min: 75, max: 130, step: 5, default: 90 } as const;

export function parseTextSize(saved: string): number {
  const n = Number(saved);
  if (saved === '' || !Number.isFinite(n)) return TEXT_SIZE.default;
  return Math.min(TEXT_SIZE.max, Math.max(TEXT_SIZE.min, Math.round(n)));
}

export function applyAppearance(textSize: number, corners: Corners) {
  const root = document.documentElement;
  root.style.setProperty('--text-scale', String(textSize / 100));
  if (corners === 'square') root.dataset.corners = 'square';
  else delete root.dataset.corners;
}

export function applyTheme(theme: Theme, scheme: Scheme) {
  const root = document.documentElement.dataset;
  if (theme === 'system') delete root.theme;
  else root.theme = theme;
  // Four Ounces is the default and has no attribute. Anything else saved
  // before 0.8.0 (the retired 'kr' scheme) falls back to it too.
  if (scheme === 'terracotta') root.scheme = scheme;
  else delete root.scheme;
}
