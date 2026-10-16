import 'server-only';
import type { Store } from '@netlify/blobs';
import { Barcode } from '@/domain/Barcode';
import { internalSequenceOf, makeInternalBarcode } from '@/domain/InternalBarcode';
import { Product, type ProductData } from '@/domain/Product';
import type { BarcodeAllocator } from './BarcodeAllocator';
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
    const row = await this.#products.get(PRODUCT_PREFIX + barcode, { type: 'json' });
    return row ? Product.fromJSON(row) : null;
  }

  async save(details: ProductDetails, { createOnly = false }: SaveOptions = {}): Promise<Product> {
    const barcode = parseBarcode(details.barcode);
    const existing = createOnly ? null : await this.get(barcode);
    const product = buildProduct({
      barcode,
      name: details.name,
      price: Number(details.price),
      currency: String(details.currency ?? '').toUpperCase(),
      unit: details.unit ?? '',
      imageUrl: existing?.imageUrl ?? null,
      updatedAt: this.#now().toISOString(),
    });
    if (createOnly) {
      // Atomic create-only write: of two requests for the same new barcode, only one succeeds.
      const { modified } = await this.#products.setJSON(PRODUCT_PREFIX + barcode, product.toJSON(), { onlyIfNew: true });
      if (!modified) throw new ProductConflictError(barcode);
    } else {
      await this.#write(product);
    }
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
    if (!SAFE_IMAGE_NAME.test(fileName)) return null;
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

/**
 * In-store barcode allocator on Netlify Blobs.
 *
 * Serverless functions run as many separate instances, so an in-memory queue
 * is not enough. Each code is *claimed* with a create-only write
 * ("claim/<code>", onlyIfNew): if two phones race for the same number, only
 * one write succeeds and the other simply moves on to the next number.
 */
export class NetlifyBlobsBarcodeAllocator implements BarcodeAllocator {
  readonly #store: BlobStore;
  readonly #products: ProductStore;

  constructor({ store, products }: { store: BlobStore; products: ProductStore }) {
    this.#store = store;
    this.#products = products;
  }

  async next(): Promise<string> {
    const used = new Set((await this.#products.list()).map((p) => p.barcode));
    const highestUsed = Math.max(0, ...[...used].map(internalSequenceOf).filter((n): n is number => n !== null));
    const lastIssued = Number((await this.#store.get('last-sequence', { type: 'json' })) ?? 0);

    for (let sequence = Math.max(lastIssued, highestUsed) + 1; ; sequence++) {
      const code = makeInternalBarcode(sequence);
      if (used.has(code)) continue;
      const { modified } = await this.#store.setJSON(`claim/${code}`, { at: new Date().toISOString() }, { onlyIfNew: true });
      if (!modified) continue; // someone else got this one first
      // Only a starting hint for next time; uniqueness comes from the claim above.
      await this.#store.setJSON('last-sequence', sequence);
      return code;
    }
  }
}
