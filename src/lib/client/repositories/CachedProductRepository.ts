import type { Barcode } from '@/domain/Barcode';
import type { Product } from '@/domain/Product';
import type { ProductRepository } from './ProductRepository';

/**
 * Adds an in-memory TTL cache in front of any repository (Decorator pattern).
 * Only hits are cached, so a product added on another phone shows up on the next scan.
 */
export class CachedProductRepository implements ProductRepository {
  readonly #inner: ProductRepository;
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #cache = new Map<string, { product: Product; expiresAt: number }>();

  constructor(inner: ProductRepository, { ttlMs = 5 * 60_000, now = Date.now }: { ttlMs?: number; now?: () => number } = {}) {
    this.#inner = inner;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  async findByBarcode(barcode: Barcode): Promise<Product | null> {
    const entry = this.#cache.get(barcode.value);
    if (entry && entry.expiresAt > this.#now()) return entry.product;

    const product = await this.#inner.findByBarcode(barcode);
    if (product) this.#cache.set(barcode.value, { product, expiresAt: this.#now() + this.#ttlMs });
    else this.#cache.delete(barcode.value);
    return product;
  }

  /** Forget one product, e.g. after its price was changed. */
  invalidate(barcode: string): void {
    this.#cache.delete(barcode);
  }

  clear(): void {
    this.#cache.clear();
  }
}
