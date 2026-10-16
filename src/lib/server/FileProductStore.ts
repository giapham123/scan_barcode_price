import 'server-only';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
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

const CONTENT_TYPE_BY_EXT = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]));

/**
 * Stores products in a JSON file and their photos in an images folder.
 *
 * - The file is read once and kept in memory.
 * - Writes are queued one after another and written atomically
 *   (temp file + rename), so a crash never leaves a half-written file.
 *
 * Needs a persistent disk: fine on your own server / VPS, NOT on serverless
 * hosting (e.g. Vercel) — use a database-backed ProductStore there.
 */
export class FileProductStore implements ProductStore {
  readonly #file: string;
  readonly #imagesDir: string;
  readonly #now: () => Date;
  #products: Promise<Map<string, Product>> | null = null; // shared by concurrent callers
  #writes: Promise<void> = Promise.resolve();

  constructor({ dataDir, now = () => new Date() }: { dataDir: string; now?: () => Date }) {
    this.#file = join(dataDir, 'products.json');
    this.#imagesDir = join(dataDir, 'images');
    this.#now = now;
  }

  async list(): Promise<Product[]> {
    const products = await this.#load();
    return [...products.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(barcode: string): Promise<Product | null> {
    return (await this.#load()).get(barcode) ?? null;
  }

  async save(details: ProductDetails, { createOnly = false }: SaveOptions = {}): Promise<Product> {
    const barcode = parseBarcode(details.barcode);
    const products = await this.#load();
    const existing = products.get(barcode);
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
    products.set(barcode, product);
    await this.#persist();
    return product;
  }

  async setImage(barcode: string, data: Uint8Array, contentType: string): Promise<Product> {
    const ext = IMAGE_TYPES[contentType];
    if (!ext) throw new ProductValidationError(`Unsupported image type: ${contentType}`);
    const product = await this.#require(barcode);

    // A new file name per upload, so browsers never show a cached old photo.
    const fileName = `${product.barcode}-${this.#now().getTime()}${ext}`;
    await mkdir(this.#imagesDir, { recursive: true });
    await writeFile(join(this.#imagesDir, fileName), data);

    return this.#replaceImage(product, `/images/${fileName}`);
  }

  async removeImage(barcode: string): Promise<Product> {
    return this.#replaceImage(await this.#require(barcode), null);
  }

  async readImage(fileName: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    // Only names we generated – this also blocks path traversal ("../").
    if (!SAFE_IMAGE_NAME.test(fileName)) return null;
    try {
      const data = await readFile(join(this.#imagesDir, fileName));
      return { data, contentType: CONTENT_TYPE_BY_EXT[extname(fileName)] };
    } catch {
      return null;
    }
  }

  async #replaceImage(product: Product, imageUrl: string | null): Promise<Product> {
    const oldUrl = product.imageUrl;
    const updated = product.with({ imageUrl, updatedAt: this.#now().toISOString() });
    (await this.#load()).set(updated.barcode, updated);
    await this.#persist();
    if (oldUrl) await this.#deleteImageFile(oldUrl);
    return updated;
  }

  async #deleteImageFile(imageUrl: string): Promise<void> {
    const fileName = imageUrl.split('/').pop() ?? '';
    if (!SAFE_IMAGE_NAME.test(fileName)) return;
    await unlink(join(this.#imagesDir, fileName)).catch(() => {}); // already gone is fine
  }

  async #require(barcode: string): Promise<Product> {
    const product = await this.get(parseBarcode(barcode));
    if (!product) throw new ProductNotFoundError(barcode);
    return product;
  }

  #load(): Promise<Map<string, Product>> {
    // Keep the promise (not the result) so simultaneous first requests share one Map.
    this.#products ??= this.#readFile().catch((err) => {
      this.#products = null; // allow a retry
      throw err;
    });
    return this.#products;
  }

  async #readFile(): Promise<Map<string, Product>> {
    let rows: ProductData[] = [];
    try {
      rows = JSON.parse(await readFile(this.#file, 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; // missing file = empty catalogue
    }
    return new Map(rows.map((row) => [row.barcode, Product.fromJSON(row)]));
  }

  async #persist(): Promise<void> {
    const products = await this.#load();
    const snapshot = JSON.stringify([...products.values()], null, 2) + '\n';
    const write = async () => {
      await mkdir(dirname(this.#file), { recursive: true });
      const tmp = `${this.#file}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, this.#file);
    };
    this.#writes = this.#writes.then(write, write);
    return this.#writes;
  }
}
