import { config } from '@/lib/config';
import { EventBus } from '@/lib/EventBus';
import { ProductApiClient } from './api/ProductApiClient';
import { PinPrompt } from './PinPrompt';
import { CachedProductRepository } from './repositories/CachedProductRepository';
import { RemoteApiProductRepository } from './repositories/RemoteApiProductRepository';
import type { AppEvents } from './services/events';
import { PriceLookupService } from './services/PriceLookupService';
import { ProductEditService } from './services/ProductEditService';

/**
 * Composition root for the browser: the ONLY place where concrete classes are
 * chosen and wired together (manual dependency injection). Components get
 * these through <ServicesProvider> / useServices(), never by `new`-ing them.
 */
export interface ClientServices {
  eventBus: EventBus<AppEvents>;
  api: ProductApiClient;
  lookupService: PriceLookupService;
  editService: ProductEditService;
}

export function createClientServices(): ClientServices {
  const eventBus = new EventBus<AppEvents>();
  const repository = new CachedProductRepository(new RemoteApiProductRepository({ baseUrl: config.apiBaseUrl }), {
    ttlMs: config.cacheTtlMs,
  });
  const api = new ProductApiClient({ baseUrl: config.apiBaseUrl, pinStore: new PinPrompt() });

  return {
    eventBus,
    api,
    lookupService: new PriceLookupService({ repository, eventBus }),
    editService: new ProductEditService({ api, cache: repository, eventBus }),
  };
}
