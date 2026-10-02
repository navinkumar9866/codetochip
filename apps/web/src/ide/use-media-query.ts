import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches, updated live (e.g. rotating a phone). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
