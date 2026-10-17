import { CatalogUnavailableError, type CatalogEntry, type ProductCatalog } from './ProductCatalog';

/** The databases of the Open Food Facts family; they share one API. */
export const OPEN_FACTS_DATABASES = {
  food: { name: 'Open Food Facts', baseUrl: 'https://world.openfoodfacts.org' },
  products: { name: 'Open Products Facts', baseUrl: 'https://world.openproductsfacts.org' },
} as const;

/** Hosts their product photos are served from. Only these may be imported (see CatalogImageImporter). */
export const OPEN_FACTS_IMAGE_HOSTS = [
  'images.openfoodfacts.org',
  'static.openfoodfacts.org',
  'images.openproductsfacts.org',
  'static.openproductsfacts.org',
];

const FIELDS = 'product_name,generic_name,brands,quantity,image_front_url,image_url';

interface OpenFactsResponse {
  status?: number;
  product?: {
    product_name?: string;
    generic_name?: string;
    brands?: string;
    quantity?: string;
    image_front_url?: string;
    image_url?: string;
  };
}

/**
 * Adapter for the Open Food Facts API (and its sister databases):
 *   GET {baseUrl}/api/v2/product/{barcode}.json?fields=…
 * Turns their response into our CatalogEntry.
 *
 * Their rules: identify the app with a custom User-Agent; reads need no account.
 */
export class OpenFactsCatalog implements ProductCatalog {
  readonly #name: string;
  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor({
    name,
    baseUrl,
    userAgent,
    timeoutMs = 5000,
    fetchFn,
  }: {
    name: string;
    baseUrl: string;
    userAgent: string;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  }) {
    this.#name = name;
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#userAgent = userAgent;
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  async lookup(barcode: string): Promise<CatalogEntry | null> {
    const url = `${this.#baseUrl}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
    let res: Response;
    try {
      res = await this.#fetch(url, {
        headers: { 'User-Agent': this.#userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      throw new CatalogUnavailableError(`${this.#name} could not be reached`, { cause: err });
    }

    if (res.status === 404) return null;
    if (!res.ok) throw new CatalogUnavailableError(`${this.#name} answered HTTP ${res.status}`);

    const data = (await res.json().catch(() => ({}))) as OpenFactsResponse;
    if (data.status !== 1 || !data.product) return null;
    return this.#toEntry(barcode, data.product);
  }

  #toEntry(barcode: string, p: NonNullable<OpenFactsResponse['product']>): CatalogEntry | null {
    const brand = firstBrand(p.brands);
    const quantity = cleanQuantity(p.quantity);
    const name = buildName(clean(p.product_name) ?? clean(p.generic_name), brand, quantity);
    if (!name) return null; // nothing useful to pre-fill
    return {
      barcode,
      name,
      brand,
      quantity,
      imageUrl: clean(p.image_front_url) ?? clean(p.image_url),
      source: { name: this.#name, url: `${this.#baseUrl}/product/${encodeURIComponent(barcode)}` },
    };
  }
}

/** "Coca-Cola Original" + "330 ml" -> "Coca-Cola Original 330 ml"; adds the brand only if it is not already in the name. */
export function buildName(productName: string | null, brand: string | null, quantity: string | null): string | null {
  const base = productName ?? brand;
  if (!base) return null;
  const parts = [base];
  if (brand && productName && !includes(productName, brand)) parts.unshift(brand);
  if (quantity && !includes(base, quantity)) parts.push(quantity);
  return parts.join(' ').slice(0, 120);
}

/** "400 g e" / "400 g ℮" -> "400 g": drops the EU "estimated quantity" mark printed on packs. */
export function cleanQuantity(quantity: string | undefined): string | null {
  return clean(quantity?.trim().replace(/\s+(e|℮)$/i, ''));
}

/** "Nutella, Ferrero" -> "Nutella" */
function firstBrand(brands: string | undefined): string | null {
  return clean(brands?.split(',')[0]);
}

function clean(text: string | undefined): string | null {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value ? value : null;
}

function includes(text: string, part: string): boolean {
  return text.toLowerCase().includes(part.toLowerCase());
}
