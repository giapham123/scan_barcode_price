/**
 * Online product databases that know real products by barcode (name, brand, photo),
 * but not YOUR prices. Used to pre-fill the "Add product" form.
 */

import type { CatalogEntry } from '@/domain/CatalogEntry';

export type { CatalogEntry };

export interface ProductCatalog {
  /**
   * @returns the entry, or null when no database knows this barcode
   * @throws {CatalogUnavailableError} when the database could not be asked (offline, rate limit…)
   */
  lookup(barcode: string): Promise<CatalogEntry | null>;
}

export class CatalogUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CatalogUnavailableError';
  }
}

/**
 * Asks several catalogs in order and returns the first match (Chain of Responsibility),
 * e.g. the food database first, then the non-food one.
 * A failing catalog does not hide a match from a later one.
 */
export class FallbackCatalog implements ProductCatalog {
  constructor(private readonly catalogs: ProductCatalog[]) {}

  async lookup(barcode: string): Promise<CatalogEntry | null> {
    let failure: unknown = null;
    for (const catalog of this.catalogs) {
      try {
        const entry = await catalog.lookup(barcode);
        if (entry) return entry;
      } catch (err) {
        failure = err;
      }
    }
    if (failure) throw failure; // nothing found, and at least one source could not answer
    return null;
  }
}

/**
 * In-memory cache in front of a catalog (Decorator). Online databases limit
 * how often they may be asked (Open Food Facts: 15 product reads/min/IP), and
 * the same unknown product is often scanned several times while it is added.
 */
export class CachedCatalog implements ProductCatalog {
  readonly #cache = new Map<string, { entry: CatalogEntry | null; expiresAt: number }>();

  constructor(
    private readonly inner: ProductCatalog,
    private readonly options: { hitTtlMs?: number; missTtlMs?: number; maxEntries?: number; now?: () => number } = {},
  ) {}

  async lookup(barcode: string): Promise<CatalogEntry | null> {
    const { hitTtlMs = 24 * 3_600_000, missTtlMs = 3_600_000, maxEntries = 1000, now = Date.now } = this.options;
    const cached = this.#cache.get(barcode);
    if (cached && cached.expiresAt > now()) return cached.entry;

    const entry = await this.inner.lookup(barcode); // errors are not cached: try again next time
    if (this.#cache.size >= maxEntries) this.#cache.delete(this.#cache.keys().next().value!);
    this.#cache.set(barcode, { entry, expiresAt: now() + (entry ? hitTtlMs : missTtlMs) });
    return entry;
  }
}
