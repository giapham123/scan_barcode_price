import type { Barcode } from '@/domain/Barcode';
import { Product } from '@/domain/Product';
import type { ProductRepository } from './ProductRepository';

/**
 * Looks up a product on the REST API.
 *   GET {baseUrl}/products/{barcode}  -> 200 product JSON, or 200 null (or 404) when unknown
 *
 * Adapt `#toProduct` if you point it at an API with a different shape (Adapter).
 */
export class RemoteApiProductRepository implements ProductRepository {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor({ baseUrl, fetchFn }: { baseUrl: string; fetchFn?: typeof fetch }) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#fetch = fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  async findByBarcode(barcode: Barcode): Promise<Product | null> {
    const res = await this.#fetch(`${this.#baseUrl}/products/${encodeURIComponent(barcode.value)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Price API error: HTTP ${res.status}`);
    const data = await res.json();
    return data ? this.#toProduct(data) : null;
  }

  #toProduct(data: Record<string, unknown>): Product {
    return Product.fromJSON(data);
  }
}
