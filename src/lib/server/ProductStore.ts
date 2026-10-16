import { Barcode, InvalidBarcodeError } from '@/domain/Barcode';
import { Product, type ProductData } from '@/domain/Product';
import { ProductValidationError } from './errors';

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
  /**
   * Create or update name / price / currency / unit. The photo is kept.
   * With `createOnly`, refuses (ProductConflictError) if the barcode is already used,
   * so a newly generated barcode can never overwrite an existing product.
   */
  save(details: ProductDetails, options?: SaveOptions): Promise<Product>;
  /** Replace the photo. */
  setImage(barcode: string, data: Uint8Array, contentType: string): Promise<Product>;
  removeImage(barcode: string): Promise<Product>;
  /** Read a stored photo by file name; null if missing. */
  readImage(fileName: string): Promise<{ data: Uint8Array; contentType: string } | null>;
}

export interface SaveOptions {
  createOnly?: boolean;
}

/** Image types we accept, mapped to the file extension we store them with. */
export const IMAGE_TYPES: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
});

/** Photo file names the stores create: "<barcode>-<timestamp>.<ext>". Anything else is refused (blocks "../" tricks). */
export const SAFE_IMAGE_NAME = /^\d{8,14}-\d+\.(jpg|png|webp)$/;

/** Valid barcode value, or a ProductValidationError (→ HTTP 400). */
export function parseBarcode(raw: unknown): string {
  try {
    return Barcode.parse(raw).value;
  } catch (err) {
    if (err instanceof InvalidBarcodeError) throw new ProductValidationError(err.message);
    throw err;
  }
}

/** New Product, or a ProductValidationError (→ HTTP 400) when a field is invalid. */
export function buildProduct(props: ProductData): Product {
  try {
    return new Product(props);
  } catch (err) {
    if (err instanceof TypeError) throw new ProductValidationError(err.message);
    throw err;
  }
}
