import { describe, expect, test } from 'vitest';
import type { CatalogEntry } from '@/domain/CatalogEntry';
import { isRestrictedCirculation, makeInternalBarcode } from '@/domain/InternalBarcode';
import { CatalogImageImporter } from '@/lib/server/catalog/CatalogImageImporter';
import { buildName, cleanQuantity, OPEN_FACTS_IMAGE_HOSTS, OpenFactsCatalog } from '@/lib/server/catalog/OpenFactsCatalog';
import { CachedCatalog, CatalogUnavailableError, FallbackCatalog, type ProductCatalog } from '@/lib/server/catalog/ProductCatalog';
import { HttpError } from '@/lib/server/errors';
import { fakeFetch } from './support/fixtures';

const COKE_RESPONSE = {
  code: '5449000000996',
  status: 1,
  product: {
    brands: 'COCA-COLA SERVICES SA/NV',
    product_name: 'Coca-Cola Original',
    quantity: '330 ml',
    image_front_url: 'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.1129.400.jpg',
  },
};

const catalogWith = (route: Parameters<typeof fakeFetch>[0]) => {
  const fake = fakeFetch(route);
  return { ...fake, catalog: new OpenFactsCatalog({ name: 'Open Food Facts', baseUrl: 'https://off.test', userAgent: 'PriceScanner/1.0 (test)', fetchFn: fake.fetch }) };
};

describe('OpenFactsCatalog (adapter)', () => {
  test('maps a found product to a CatalogEntry and identifies the app', async () => {
    const { catalog, calls } = catalogWith(() => Response.json(COKE_RESPONSE));
    expect(await catalog.lookup('5449000000996')).toEqual({
      barcode: '5449000000996',
      name: 'COCA-COLA SERVICES SA/NV Coca-Cola Original 330 ml',
      brand: 'COCA-COLA SERVICES SA/NV',
      quantity: '330 ml',
      imageUrl: COKE_RESPONSE.product.image_front_url,
      source: { name: 'Open Food Facts', url: 'https://off.test/product/5449000000996' },
    });
    expect(calls[0].url).toMatch(/^https:\/\/off\.test\/api\/v2\/product\/5449000000996\.json\?fields=/);
    expect((calls[0].init.headers as Record<string, string>)['User-Agent']).toBe('PriceScanner/1.0 (test)');
  });

  test('unknown products (status 0 or 404) and nameless entries are "not found"', async () => {
    expect(await catalogWith(() => Response.json({ status: 0 })).catalog.lookup('96385074')).toBeNull();
    expect(await catalogWith(() => new Response('{}', { status: 404 })).catalog.lookup('96385074')).toBeNull();
    expect(await catalogWith(() => Response.json({ status: 1, product: { quantity: '1 l' } })).catalog.lookup('96385074')).toBeNull();
  });

  test('rate limits, server errors and network failures mean "unavailable", not "not found"', async () => {
    for (const status of [429, 503, 500]) {
      await expect(catalogWith(() => new Response('', { status })).catalog.lookup('96385074')).rejects.toBeInstanceOf(CatalogUnavailableError);
    }
    await expect(
      catalogWith(() => {
        throw new TypeError('fetch failed');
      }).catalog.lookup('96385074'),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  test('cleanQuantity drops the EU estimated-quantity mark', () => {
    expect(cleanQuantity('400 g e')).toBe('400 g');
    expect(cleanQuantity('1 l ℮')).toBe('1 l');
    expect(cleanQuantity(' 330  ml ')).toBe('330 ml');
    expect(cleanQuantity('')).toBeNull();
  });

  test('buildName adds the first brand and the quantity only when missing', () => {
    expect(buildName('Nutella', 'Nutella', '400 g')).toBe('Nutella 400 g');
    expect(buildName('Original', 'Coca-Cola', '330 ml')).toBe('Coca-Cola Original 330 ml');
    expect(buildName('Water 500 ml', null, '500 ml')).toBe('Water 500 ml');
    expect(buildName(null, 'Brandname', null)).toBe('Brandname');
    expect(buildName(null, null, '1 l')).toBeNull();
  });
});

describe('FallbackCatalog / CachedCatalog', () => {
  const entry = (barcode: string, name = 'X'): CatalogEntry => ({ barcode, name, brand: null, quantity: null, imageUrl: null, source: { name: 's', url: 'u' } });
  const counting = (impl: ProductCatalog['lookup']) => {
    const calls: string[] = [];
    return { calls, lookup: async (b: string) => (calls.push(b), impl(b)) };
  };

  test('fallback: first match wins; a failing source does not hide a later match', async () => {
    const down = counting(async () => Promise.reject(new CatalogUnavailableError('down')));
    const food = counting(async () => null);
    const products = counting(async (b) => entry(b, 'Pen'));
    expect((await new FallbackCatalog([down, food, products]).lookup('96385074'))?.name).toBe('Pen');
    expect(await new FallbackCatalog([food]).lookup('96385074')).toBeNull();
    await expect(new FallbackCatalog([down, food]).lookup('96385074')).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  test('cache: hits and misses are cached for their TTL; errors are not cached', async () => {
    let now = 0;
    let fail = true;
    const inner = counting(async (b) => {
      if (fail) throw new CatalogUnavailableError('down');
      return b === '96385074' ? entry(b) : null;
    });
    const cached = new CachedCatalog(inner, { hitTtlMs: 1000, missTtlMs: 100, now: () => now });

    await expect(cached.lookup('96385074')).rejects.toThrow();
    fail = false;
    await cached.lookup('96385074');
    await cached.lookup('96385074');
    await cached.lookup('5449000000996');
    await cached.lookup('5449000000996');
    expect(inner.calls).toEqual(['96385074', '96385074', '5449000000996']);
    now = 500; // miss expired, hit still fresh
    await cached.lookup('96385074');
    await cached.lookup('5449000000996');
    expect(inner.calls).toHaveLength(4);
  });
});

describe('CatalogImageImporter', () => {
  const ok = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
  const importer = (route: Parameters<typeof fakeFetch>[0] = ok, maxBytes = 1000) => {
    const fake = fakeFetch(route);
    return { ...fake, importer: new CatalogImageImporter({ allowedHosts: OPEN_FACTS_IMAGE_HOSTS, maxBytes, userAgent: 'test', fetchFn: fake.fetch }) };
  };

  test('only HTTPS URLs on the database image hosts are fetched (no SSRF)', async () => {
    const { importer: i, calls } = importer();
    for (const url of [
      'http://images.openfoodfacts.org/a.jpg',
      'https://evil.example/a.jpg',
      'https://images.openfoodfacts.org.evil.example/a.jpg',
      'https://images.openfoodfacts.org:8443/a.jpg',
      'https://user:pw@images.openfoodfacts.org/a.jpg',
      'http://169.254.169.254/latest/meta-data',
      'not a url',
    ]) {
      await expect(i.download(url)).rejects.toMatchObject({ status: 400 });
    }
    expect(calls).toHaveLength(0);
  });

  test('downloads allowed photos without following redirects; refuses wrong types and sizes', async () => {
    const good = importer();
    const image = await good.importer.download('https://images.openfoodfacts.org/images/products/1.jpg');
    expect(image).toEqual({ data: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    expect(good.calls[0].init.redirect).toBe('error');

    const html = importer(() => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }));
    await expect(html.importer.download('https://images.openfoodfacts.org/x.jpg')).rejects.toBeInstanceOf(HttpError);
    const big = importer(ok, 2);
    await expect(big.importer.download('https://images.openfoodfacts.org/x.jpg')).rejects.toMatchObject({ status: 502 });
    const missing = importer(() => new Response('', { status: 404 }));
    await expect(missing.importer.download('https://images.openfoodfacts.org/x.jpg')).rejects.toMatchObject({ status: 502 });
  });
});

describe('restricted-circulation (in-store) codes', () => {
  test('are recognised for any shop, so they are never looked up online', () => {
    expect(isRestrictedCirculation(makeInternalBarcode(1))).toBe(true);
    expect(isRestrictedCirculation('2912345678906')).toBe(true);
    expect(isRestrictedCirculation('412345678905')).toBe(true); // UPC-A, number system 4
    expect(isRestrictedCirculation('5449000000996')).toBe(false);
    expect(isRestrictedCirculation('036000291452')).toBe(false);
    expect(isRestrictedCirculation('96385074')).toBe(false);
  });
});
