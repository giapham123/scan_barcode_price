import type { Barcode } from '@/domain/Barcode';
import type { Product } from '@/domain/Product';

/**
 * Repository contract (Repository pattern).
 *
 * The lookup service only depends on this interface, so the data source
 * (REST API, IndexedDB for offline use...) can be swapped without touching it.
 */
export interface ProductRepository {
  /** null when not found */
  findByBarcode(barcode: Barcode): Promise<Product | null>;
}
