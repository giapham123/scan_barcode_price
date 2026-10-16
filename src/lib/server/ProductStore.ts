import type { Product } from '@/domain/Product';

export interface ProductDetails {
  barcode: string;
  name: string;
  price: number;
  currency: string;
  unit?: string;
}

/**
 * Where products and photos are kept (Repository pattern, server side).
 * The route handlers only know this interface, so FileProductStore can be
 * replaced by a database-backed store without touching them.
 */
export interface ProductStore {
  /** All products, sorted by name. */
  list(): Promise<Product[]>;
  get(barcode: string): Promise<Product | null>;
  /** Create or update name / price / currency / unit. The photo is kept. */
  save(details: ProductDetails): Promise<Product>;
  /** Replace the photo. */
  setImage(barcode: string, data: Uint8Array, contentType: string): Promise<Product>;
  removeImage(barcode: string): Promise<Product>;
  /** Read a stored photo by file name; null if missing. */
  readImage(fileName: string): Promise<{ data: Uint8Array; contentType: string } | null>;
}

/** Image types we accept, mapped to the file extension we store them with. */
export const IMAGE_TYPES: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
});
