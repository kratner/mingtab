import { useEffect, useState } from 'react';

// Per-device UI preferences. localStorage is shared by the side panel and the
// new-tab page (same extension origin) and survives restarts.

export type Theme = 'system' | 'light' | 'dark';
export type Scheme = 'kr' | 'terracotta';
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

export function applyTheme(theme: Theme, scheme: Scheme) {
  const root = document.documentElement.dataset;
  if (theme === 'system') delete root.theme;
  else root.theme = theme;
  if (scheme === 'kr') delete root.scheme;
  else root.scheme = scheme;
}
