import 'server-only';
import type { Store } from '@netlify/blobs';
import { Barcode } from '@/domain/Barcode';
import { Product, type ProductData } from '@/domain/Product';
import { ProductConflictError, ProductNotFoundError, ProductValidationError } from './errors';
import {
  buildProduct,
  IMAGE_TYPES,
  parseBarcode,
  SAFE_IMAGE_NAME,
  type ProductDetails,
  type ProductStore,
  type SaveOptions,
} from './ProductStore';

/** The parts of a Netlify Blobs store we use (lets tests pass an in-memory fake). */
export type BlobStore = Pick<Store, 'get' | 'getWithMetadata' | 'set' | 'setJSON' | 'list' | 'delete'>;

const PRODUCT_PREFIX = 'product/';

/**
 * ProductStore on Netlify Blobs, for serverless hosting where there is no disk.
 *
 * - One blob per product ("product/<barcode>"), so saving different products
 *   at the same time can never overwrite each other.
 * - Photos live in a separate store; their content type is kept as metadata.
 * - Stores should be opened with strong consistency, so a change is visible
 *   on the very next request.
 * - Only plain reads and writes are used: conditional writes (onlyIfNew)
 *   timed out on Netlify in production.
 * - A key is only read after a list call shows it exists: reading a MISSING
 *   key is retried by the Blobs client for ~25 s, which made creating new
 *   products time out (HTTP 502/504).
 */
export class NetlifyBlobsProductStore implements ProductStore {
  readonly #products: BlobStore;
  readonly #images: BlobStore;
  readonly #now: () => Date;

  constructor({ products, images, now = () => new Date() }: { products: BlobStore; images: BlobStore; now?: () => Date }) {
    this.#products = products;
    this.#images = images;
    this.#now = now;
  }

  async list(): Promise<Product[]> {
    const { blobs } = await this.#products.list({ prefix: PRODUCT_PREFIX });
    const rows = await Promise.all(blobs.map(({ key }) => this.#products.get(key, { type: 'json' })));
    return rows
      .filter((row): row is ProductData => row !== null)
      .map(Product.fromJSON)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(barcode: string): Promise<Product | null> {
    if (!Barcode.isValid(barcode)) return null;
    const key = PRODUCT_PREFIX + barcode;
    if (!(await exists(this.#products, key))) return null;
    const row = await this.#products.get(key, { type: 'json' });
    return row ? Product.fromJSON(row) : null;
  }

  /** All barcodes in use – one list call, without reading every product. */
  async barcodes(): Promise<Set<string>> {
    const { blobs } = await this.#products.list({ prefix: PRODUCT_PREFIX });
    return new Set(blobs.map(({ key }) => key.slice(PRODUCT_PREFIX.length)));
  }

  async save(details: ProductDetails, { createOnly = false }: SaveOptions = {}): Promise<Product> {
    const barcode = parseBarcode(details.barcode);
    const existing = await this.get(barcode);
    if (createOnly && existing) throw new ProductConflictError(barcode);
    const product = buildProduct({
      barcode,
      name: details.name,
      price: Number(details.price),
      currency: String(details.currency ?? '').toUpperCase(),
      unit: details.unit ?? '',
      imageUrl: existing?.imageUrl ?? null,
      updatedAt: this.#now().toISOString(),
    });
    // Plain write: Netlify Blobs' conditional (create-only) writes timed out in production.
    // createOnly is checked above; new barcodes are random, so a race is practically impossible.
    await this.#write(product);
    return product;
  }

  async setImage(barcode: string, data: Uint8Array, contentType: string): Promise<Product> {
    const ext = IMAGE_TYPES[contentType];
    if (!ext) throw new ProductValidationError(`Unsupported image type: ${contentType}`);
    const product = await this.#require(barcode);

    // A new name per upload, so browsers and the image CDN never show a cached old photo.
    const fileName = `${product.barcode}-${this.#now().getTime()}${ext}`;
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    await this.#images.set(fileName, bytes, { metadata: { contentType } });
    return this.#replaceImage(product, `/images/${fileName}`);
  }

  async removeImage(barcode: string): Promise<Product> {
    return this.#replaceImage(await this.#require(barcode), null);
  }

  async readImage(fileName: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (!SAFE_IMAGE_NAME.test(fileName) || !(await exists(this.#images, fileName))) return null;
    const entry = await this.#images.getWithMetadata(fileName, { type: 'arrayBuffer' });
    if (!entry) return null;
    return { data: new Uint8Array(entry.data), contentType: String(entry.metadata.contentType ?? 'image/jpeg') };
  }

  async #replaceImage(product: Product, imageUrl: string | null): Promise<Product> {
    const updated = product.with({ imageUrl, updatedAt: this.#now().toISOString() });
    await this.#write(updated);
    const oldName = product.imageUrl?.split('/').pop();
    if (oldName && SAFE_IMAGE_NAME.test(oldName)) await this.#images.delete(oldName);
    return updated;
  }

  async #write(product: Product): Promise<void> {
    await this.#products.setJSON(PRODUCT_PREFIX + product.barcode, product.toJSON());
  }

  async #require(barcode: string): Promise<Product> {
    const product = await this.get(parseBarcode(barcode));
    if (!product) throw new ProductNotFoundError(barcode);
    return product;
  }
}

/** Whether `key` exists, using a cheap list call (reading a missing key is slow, see above). */
async function exists(store: BlobStore, key: string): Promise<boolean> {
  const { blobs } = await store.list({ prefix: key });
  return blobs.some((blob) => blob.key === key);
}
