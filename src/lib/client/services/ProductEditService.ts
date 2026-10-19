import type { Product } from '@/domain/Product';
import type { EventBus } from '@/lib/EventBus';
import { ApiError, type ProductApiClient } from '../api/ProductApiClient';
import type { AppEvents } from './events';

const MAX_BARCODE_ATTEMPTS = 5;

/**
 * The product details were saved, but the photo step failed.
 * `product` is what was saved, so the caller must not save it again as new.
 */
export class PhotoUploadError extends Error {
  constructor(
    readonly product: Product,
    cause: Error,
  ) {
    super(`Saved, but the photo could not be uploaded: ${cause.message}`, { cause });
    this.name = 'PhotoUploadError';
  }
}

/** What to do with the photo: keep it, remove it, upload a new one, or import one from the online database. */
export type PhotoChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; image: Blob }
  | { kind: 'import'; url: string };

export interface ProductDraft {
  /** null = the product has none; a new in-store barcode is created on save. */
  barcode: string | null;
  name: string;
  price: number;
  currency: string;
  unit: string;
}

/**
 * Use case: add a product or change its details / photo.
 * After saving it clears the lookup cache and announces 'product:saved', so the
 * result card and cart pick up the new price without knowing about this class.
 */
export class ProductEditService {
  readonly #api: ProductApiClient;
  readonly #cache: { invalidate(barcode: string): void } | null;
  readonly #events: EventBus<AppEvents> | null;
  /** Background copy of an online photo still running, if any. */
  #pendingImport: Promise<void> = Promise.resolve();

  constructor({
    api,
    cache = null,
    eventBus = null,
  }: {
    api: ProductApiClient;
    cache?: { invalidate(barcode: string): void } | null;
    eventBus?: EventBus<AppEvents> | null;
  }) {
    this.#api = api;
    this.#cache = cache;
    this.#events = eventBus;
  }

  async save(draft: ProductDraft, photo: PhotoChange = { kind: 'keep' }): Promise<Product> {
    const createBarcode = !draft.barcode;
    let product = draft.barcode
      ? await this.#api.save({ ...draft, barcode: draft.barcode })
      : await this.#createWithNewBarcode(draft);

    if (photo.kind === 'import') {
      // The online database's image server can be slow (10 s+): don't make the user wait.
      // The product is saved now; its photo arrives later via another 'product:saved'.
      this.#announce(product, createBarcode);
      this.#pendingImport = this.#importInBackground(product.barcode, photo.url);
      return product;
    }

    try {
      if (photo.kind === 'remove' && product.imageUrl) product = await this.#api.removeImage(product.barcode);
      else if (photo.kind === 'replace') product = await this.#api.uploadImage(product.barcode, photo.image);
    } catch (err) {
      this.#announce(product, createBarcode); // the product itself exists now
      throw new PhotoUploadError(product, err as Error);
    }

    this.#announce(product, createBarcode);
    return product;
  }

  /**
   * Get a new in-store barcode and create the product with it. The barcode is
   * fetched only now, so cancelling the form never uses up a number. The save is
   * create-only: if that code is somehow already taken (409), take the next one
   * instead of overwriting the other product.
   */
  async #createWithNewBarcode(draft: ProductDraft): Promise<Product> {
    for (let attempt = 1; ; attempt++) {
      const barcode = await this.#api.allocateBarcode();
      try {
        return await this.#api.save({ ...draft, barcode }, { createOnly: true });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409) || attempt === MAX_BARCODE_ATTEMPTS) throw err;
      }
    }
  }

  /** Settles when the latest background photo import is done (for tests). */
  get pendingImport(): Promise<void> {
    return this.#pendingImport;
  }

  async #importInBackground(barcode: string, url: string): Promise<void> {
    try {
      const product = await this.#api.importImage(barcode, url);
      this.#announce(product, false);
    } catch (err) {
      // The product is saved; it just has no photo. One can be added later in the editor.
      console.warn(`[photos] could not copy the online photo for ${barcode}`, err);
    }
  }

  #announce(product: Product, barcodeCreated: boolean): void {
    this.#cache?.invalidate(product.barcode);
    this.#events?.emit('product:saved', product);
    if (barcodeCreated) this.#events?.emit('product:barcode-created', product);
  }
}
