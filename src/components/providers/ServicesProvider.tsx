'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createClientServices, type ClientServices } from '@/lib/client/container';
import type { AppEvents } from '@/lib/client/services/events';

const ServicesContext = createContext<ClientServices | null>(null);

/** Creates the browser services once and shares them with every component below. */
export function ServicesProvider({ children }: { children: React.ReactNode }) {
  const [services] = useState(createClientServices);
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): ClientServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices() must be used inside <ServicesProvider>');
  return services;
}

/**
 * Subscribe to an app event for as long as the component is mounted.
 * The latest `handler` is always called, so it can use current state freely.
 */
export function useAppEvent<K extends keyof AppEvents>(event: K, handler: (payload: AppEvents[K]) => void): void {
  const { eventBus } = useServices();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => eventBus.on(event, (payload) => handlerRef.current(payload)), [eventBus, event]);
}
