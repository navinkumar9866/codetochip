import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Places in the top bar a page can fill. The editor puts its project name after the
 * "Projects" breadcrumb (`start`), its mode switch next to it (`modes`), and its board picker
 * and connection chip before the gear (`end`).
 */
export interface TopBarSlots {
  start: HTMLElement | null;
  modes: HTMLElement | null;
  end: HTMLElement | null;
}

export const TopBarContext = createContext<TopBarSlots>({ start: null, modes: null, end: null });

function slot(name: keyof TopBarSlots) {
  return function TopBarSlot({ children }: { children: ReactNode }) {
    const el = useContext(TopBarContext)[name];
    return el ? createPortal(children, el) : null;
  };
}

export const TopBarStart = slot('start');
export const TopBarModes = slot('modes');
export const TopBarEnd = slot('end');
