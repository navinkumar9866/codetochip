import { useSyncExternalStore } from 'react';

export const THEMES = [
  { id: 'codetochip', label: 'CodeToChip' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'simple', label: 'Simple' },
  { id: 'modern', label: 'Modern' },
  { id: 'professional', label: 'Professional' },
  { id: 'kids', label: 'Kids' },
] as const;
export const DENSITIES = [
  { id: 'compact', label: 'Compact' },
  { id: 'standard', label: 'Standard' },
  { id: 'large', label: 'Large' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export type DensityId = (typeof DENSITIES)[number]['id'];
export interface Display {
  theme: ThemeId;
  density: DensityId;
}

const KEYS = { theme: 'c2c-theme', density: 'c2c-density' } as const;
const DEFAULT: Display = { theme: 'codetochip', density: 'standard' };

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, sandboxed preview)
  }
};

function load(): Display {
  const theme = THEMES.find((t) => t.id === read(KEYS.theme))?.id ?? DEFAULT.theme;
  const density = DENSITIES.find((d) => d.id === read(KEYS.density))?.id ?? DEFAULT.density;
  return { theme, density };
}

let current = load();
const listeners = new Set<() => void>();

/** Puts the theme and density on <html>; the CSS in index.css does the rest. */
export function applyDisplay(d: Display = current) {
  const html = document.documentElement;
  html.dataset.theme = d.theme;
  html.dataset.density = d.density;
  const bg = getComputedStyle(html).getPropertyValue('--ground').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

/** Changes the display settings; remembered on this device. */
export function setDisplay(change: Partial<Display>) {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEYS.theme, current.theme);
    localStorage.setItem(KEYS.density, current.density);
  } catch {
    // Not remembered, but still applied for this visit.
  }
  applyDisplay();
  for (const l of listeners) l();
}

export function useDisplay(): Display {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
