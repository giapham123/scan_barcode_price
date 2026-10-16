import type { Product } from '@/domain/Product';
import type { EventBus } from '@/lib/EventBus';
import type { ProductApiClient } from '../api/ProductApiClient';
import type { AppEvents } from './events';

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

/** What to do with the photo: keep it, remove it, or upload a new one. */
export type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; image: Blob };

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
    // Created only at save time, so cancelling the form never uses up a number.
    const createBarcode = !draft.barcode;
    const barcode = draft.barcode || (await this.#api.allocateBarcode());

    let product = await this.#api.save({ ...draft, barcode });

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

  #announce(product: Product, barcodeCreated: boolean): void {
    this.#cache?.invalidate(product.barcode);
    this.#events?.emit('product:saved', product);
    if (barcodeCreated) this.#events?.emit('product:barcode-created', product);
  }
}
