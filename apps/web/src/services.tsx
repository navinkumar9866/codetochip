import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppServices, AppUser } from '@codetochip/data';

const ServicesContext = createContext<AppServices | null>(null);

/** Components get backend services from here, never by importing Firebase. Tests pass in-memory ones. */
export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}

/** `undefined` while auth is still loading, then the user or null. */
export function useCurrentUser(): AppUser | null | undefined {
  const { auth } = useServices();
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  useEffect(() => auth.onChange(setUser), [auth]);
  return user;
}
