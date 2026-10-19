import { describe, expect, test } from 'vitest';
import { Barcode } from '@/domain/Barcode';
import type { Product } from '@/domain/Product';
import { ApiError, AuthCancelledError, ProductApiClient, type PinStore } from '@/lib/client/api/ProductApiClient';
import { CachedProductRepository } from '@/lib/client/repositories/CachedProductRepository';
import type { ProductRepository } from '@/lib/client/repositories/ProductRepository';
import { RemoteApiProductRepository } from '@/lib/client/repositories/RemoteApiProductRepository';
import type { AppEvents } from '@/lib/client/services/events';
import { PriceLookupService } from '@/lib/client/services/PriceLookupService';
import { PhotoUploadError, ProductEditService } from '@/lib/client/services/ProductEditService';
import { EventBus } from '@/lib/EventBus';
import { COLA, fakeFetch, product } from './support/fixtures';

const repoOf = (products: Product[], counter = { calls: 0 }): ProductRepository => ({
  async findByBarcode(barcode) {
    counter.calls++;
    return products.find((p) => p.barcode === barcode.value) ?? null;
  },
});

function recordEvents(bus: EventBus<AppEvents>) {
  const seen: [keyof AppEvents, unknown][] = [];
  for (const name of ['lookup:started', 'lookup:completed', 'product:saved', 'product:barcode-created'] as const) {
    bus.on(name, (payload) => seen.push([name, payload]));
  }
  return seen;
}

describe('PriceLookupService', () => {
  test('found / not found, with the barcode format', async () => {
    const service = new PriceLookupService({ repository: repoOf([product(COLA)]) });
    const found = await service.lookup(' 5449000000996 ');
    expect(found).toMatchObject({ status: 'found', format: 'EAN-13', code: '5449000000996' });
    expect(await service.lookup('96385074')).toEqual({ status: 'not-found', code: '96385074', format: 'EAN-8' });
  });

  test('an invalid code never reaches the repository', async () => {
    const counter = { calls: 0 };
    const service = new PriceLookupService({ repository: repoOf([], counter) });
    expect(await service.lookup('123')).toEqual({ status: 'invalid', code: '123', message: 'unsupported format' });
    expect(counter.calls).toBe(0);
  });

  test('a repository failure becomes an error result instead of throwing', async () => {
    const service = new PriceLookupService({
      repository: { findByBarcode: async () => Promise.reject(new Error('offline')) },
    });
    expect(await service.lookup('5449000000996')).toMatchObject({ status: 'error', message: 'offline' });
  });

  test('publishes started and completed events', async () => {
    const bus = new EventBus<AppEvents>();
    const seen = recordEvents(bus);
    await new PriceLookupService({ repository: repoOf([]), eventBus: bus }).lookup('96385074');
    expect(seen.map(([name]) => name)).toEqual(['lookup:started', 'lookup:completed']);
  });
});

describe('repositories', () => {
  test('RemoteApi maps 200 / 200 null / 404 / errors', async () => {
    const empty = new RemoteApiProductRepository({ baseUrl: '/api', fetchFn: fakeFetch(() => Response.json(null)).fetch });
    expect(await empty.findByBarcode(Barcode.parse('96385074'))).toBeNull();
    const { fetch, calls } = fakeFetch((url) =>
      url.endsWith('5449000000996') ? Response.json(COLA) : url.endsWith('96385074') ? new Response(null, { status: 404 }) : new Response(null, { status: 500 }),
    );
    const repo = new RemoteApiProductRepository({ baseUrl: '/api/', fetchFn: fetch });
    expect((await repo.findByBarcode(Barcode.parse('5449000000996')))?.name).toBe('Cola 330ml');
    expect(await repo.findByBarcode(Barcode.parse('96385074'))).toBeNull();
    await expect(repo.findByBarcode(Barcode.parse('036000291452'))).rejects.toThrow(/HTTP 500/);
    expect(calls[0].url).toBe('/api/products/5449000000996');
  });

  test('Cached serves hits until the TTL expires, never caches misses, and can be invalidated', async () => {
    let now = 0;
    const counter = { calls: 0 };
    const cached = new CachedProductRepository(repoOf([product(COLA)], counter), { ttlMs: 1000, now: () => now });
    const cola = Barcode.parse('5449000000996');
    const gum = Barcode.parse('96385074');

    await cached.findByBarcode(cola);
    await cached.findByBarcode(cola);
    expect(counter.calls).toBe(1);
    now = 1500;
    await cached.findByBarcode(cola);
    expect(counter.calls).toBe(2);

    await cached.findByBarcode(gum);
    await cached.findByBarcode(gum);
    expect(counter.calls).toBe(4);

    cached.invalidate(cola.value);
    await cached.findByBarcode(cola);
    expect(counter.calls).toBe(5);
  });
});

describe('ProductApiClient', () => {
  function pins(answer: string | null): PinStore & { asked: string[] } {
    let stored: string | null = null;
    const asked: string[] = [];
    return {
      asked,
      get: () => stored,
      ask: async (message) => {
        asked.push(message);
        return (stored = answer);
      },
      clear: () => {
        stored = null;
      },
    };
  }

  test('asks for the PIN on 401 and retries with it', async () => {
    const { fetch, calls } = fakeFetch((_url, init) =>
      (init.headers as Record<string, string>)['X-Admin-Pin'] === '1234'
        ? Response.json({ ...COLA, price: 2 })
        : Response.json({ error: 'pin' }, { status: 401 }),
    );
    const pinStore = pins('1234');
    const api = new ProductApiClient({ baseUrl: '/api', pinStore, fetchFn: fetch });

    const saved = await api.save({ barcode: COLA.barcode, name: COLA.name, price: 2, currency: 'USD', unit: 'can' });
    expect(saved.price).toBe(2);
    expect(pinStore.asked).toHaveLength(1);
    expect(calls).toHaveLength(2);

    await api.save({ barcode: COLA.barcode, name: COLA.name, price: 2, currency: 'USD', unit: 'can' });
    expect(pinStore.asked).toHaveLength(1); // remembered
  });

  test('lookupCatalog: null means "not known", other errors are thrown', async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.endsWith('/96385074') ? Response.json({ barcode: '96385074', name: 'Gum' }) : url.endsWith('/5449000000996') ? Response.json(null) : Response.json({}, { status: 503 }),
    );
    const api = new ProductApiClient({ baseUrl: '/api', fetchFn: fetch });
    expect((await api.lookupCatalog('96385074'))?.name).toBe('Gum');
    expect(await api.lookupCatalog('5449000000996')).toBeNull();
    await expect(api.lookupCatalog('036000291452')).rejects.toMatchObject({ status: 503 });
    expect(calls[0].url).toBe('/api/catalog/96385074');
  });

  test('a cancelled PIN and server errors are reported', async () => {
    const unauthorized = fakeFetch(() => Response.json({ error: 'pin' }, { status: 401 }));
    const api = new ProductApiClient({ baseUrl: '/api', pinStore: pins(null), fetchFn: unauthorized.fetch });
    await expect(api.allocateBarcode()).rejects.toBeInstanceOf(AuthCancelledError);

    const broken = fakeFetch(() => Response.json({ error: 'Product name is required' }, { status: 400 }));
    const api2 = new ProductApiClient({ baseUrl: '/api', fetchFn: broken.fetch });
    await expect(api2.list()).rejects.toThrow(ApiError);
    await expect(api2.list()).rejects.toThrow('Product name is required');
  });
});

describe('ProductEditService', () => {
  /** Fake API that records what was called. */
  function fakeApi({ failUpload = false, taken = [] as string[] } = {}) {
    const calls: string[] = [];
    const codes = ['2000000000015', '2000000000022', '2000000000039'];
    const api = {
      calls,
      allocateBarcode: async () => (calls.push('allocate'), codes.shift()!),
      save: async (input: { barcode: string; name: string; price: number; currency: string; unit: string }, { createOnly = false } = {}) => {
        calls.push(`save ${input.barcode}${createOnly ? ' (create-only)' : ''}`);
        if (createOnly && taken.includes(input.barcode)) throw new ApiError(409, 'already exists');
        return product({ ...input });
      },
      uploadImage: async (barcode: string) => {
        calls.push(`upload ${barcode}`);
        if (failUpload) throw new Error('network');
        return product({ ...COLA, barcode }, { imageUrl: `/images/${barcode}-1.jpg` });
      },
      removeImage: async (barcode: string) => (calls.push(`remove ${barcode}`), product(COLA, { imageUrl: null })),
      importImage: async (barcode: string, url: string) => (calls.push(`import ${barcode} ${url}`), product(COLA, { imageUrl: `/images/${barcode}-2.jpg` })),
    };
    return api as typeof api & ProductApiClient;
  }
  const draft = { barcode: COLA.barcode, name: 'Cola', price: 1.5, currency: 'USD', unit: 'can' };

  test('keeps, replaces or removes the photo', async () => {
    const api = fakeApi();
    const service = new ProductEditService({ api });
    await service.save(draft);
    await service.save(draft, { kind: 'replace', image: new Blob(['x'], { type: 'image/jpeg' }) });
    await service.save(draft, { kind: 'remove' }); // nothing to remove: the saved product has no photo
    expect(api.calls).toEqual(['save 5449000000996', 'save 5449000000996', 'upload 5449000000996', 'save 5449000000996']);
  });

  test('an online photo is copied in the background: the product is ready at once, the photo follows', async () => {
    const api = fakeApi();
    const bus = new EventBus<AppEvents>();
    const seen = recordEvents(bus);
    const service = new ProductEditService({ api, eventBus: bus });

    const saved = await service.save(draft, { kind: 'import', url: 'https://images.openfoodfacts.org/1.jpg' });
    expect(saved.imageUrl).toBeNull(); // not waiting for the (possibly slow) image server
    await service.pendingImport;
    expect(api.calls).toEqual(['save 5449000000996', 'import 5449000000996 https://images.openfoodfacts.org/1.jpg']);
    const updates = seen.filter(([name]) => name === 'product:saved').map(([, p]) => (p as { imageUrl: string | null }).imageUrl);
    expect(updates).toEqual([null, '/images/5449000000996-2.jpg']);
  });

  test('a failed online photo copy leaves the saved product without a photo, no error', async () => {
    const api = fakeApi();
    api.importImage = async () => Promise.reject(new Error('timeout'));
    const service = new ProductEditService({ api });
    const warn = console.warn;
    console.warn = () => {};
    try {
      const saved = await service.save(draft, { kind: 'import', url: 'https://images.openfoodfacts.org/1.jpg' });
      await service.pendingImport;
      expect(saved.name).toBe('Cola');
    } finally {
      console.warn = warn;
    }
  });

  test('clears the cache entry and announces the change', async () => {
    const bus = new EventBus<AppEvents>();
    const seen = recordEvents(bus);
    const invalidated: string[] = [];
    const service = new ProductEditService({ api: fakeApi(), cache: { invalidate: (b) => invalidated.push(b) }, eventBus: bus });

    await service.save(draft);
    expect(invalidated).toEqual([COLA.barcode]);
    expect(seen.map(([name]) => name)).toEqual(['product:saved']);
  });

  test('barcode null -> allocates one, saves with it, announces barcode-created', async () => {
    const api = fakeApi();
    const bus = new EventBus<AppEvents>();
    const seen = recordEvents(bus);
    const saved = await new ProductEditService({ api, eventBus: bus }).save({ ...draft, barcode: null });

    expect(saved.barcode).toBe('2000000000015');
    expect(api.calls).toEqual(['allocate', 'save 2000000000015 (create-only)']);
    expect(seen.map(([name]) => name)).toEqual(['product:saved', 'product:barcode-created']);
  });

  test('a generated barcode that is already taken (409) is skipped, never overwritten', async () => {
    const api = fakeApi({ taken: ['2000000000015'] });
    const saved = await new ProductEditService({ api }).save({ ...draft, barcode: null });
    expect(saved.barcode).toBe('2000000000022');
    expect(api.calls).toEqual(['allocate', 'save 2000000000015 (create-only)', 'allocate', 'save 2000000000022 (create-only)']);
  });

  test('a photo failure after creating reports the saved product (no duplicate on retry)', async () => {
    const bus = new EventBus<AppEvents>();
    const seen = recordEvents(bus);
    const service = new ProductEditService({ api: fakeApi({ failUpload: true }), eventBus: bus });

    const error = await service
      .save({ ...draft, barcode: null }, { kind: 'replace', image: new Blob(['x'], { type: 'image/jpeg' }) })
      .catch((e) => e);
    expect(error).toBeInstanceOf(PhotoUploadError);
    expect((error as PhotoUploadError).product.barcode).toBe('2000000000015');
    expect(seen.map(([name]) => name)).toEqual(['product:saved', 'product:barcode-created']);
  });
});

describe('EventBus', () => {
  test('a failing handler does not block others; unsubscribe works', () => {
    const bus = new EventBus<{ x: number }>();
    const seen: number[] = [];
    const originalError = console.error;
    console.error = () => {};
    try {
      bus.on('x', () => {
        throw new Error('boom');
      });
      const off = bus.on('x', (v) => seen.push(v));
      bus.emit('x', 1);
      off();
      bus.emit('x', 2);
    } finally {
      console.error = originalError;
    }
    expect(seen).toEqual([1]);
  });
});
