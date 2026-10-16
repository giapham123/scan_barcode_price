import { Barcode, InvalidBarcodeError } from '@/domain/Barcode';
import type { Product } from '@/domain/Product';
import type { EventBus } from '@/lib/EventBus';
import type { ProductRepository } from '../repositories/ProductRepository';
import type { AppEvents } from './events';

export type LookupResult =
  | { status: 'found'; code: string; format: string; product: Product }
  | { status: 'not-found'; code: string; format: string }
  | { status: 'invalid'; code: string; message: string }
  | { status: 'error'; code: string; format: string; message: string };

export type LookupStatus = LookupResult['status'];

/**
 * Single entry point for "scanned code -> price" (Facade).
 * Validates the code, queries the repository and publishes the result.
 * Never throws: every outcome is returned as a LookupResult.
 */
export class PriceLookupService {
  readonly #repository: ProductRepository;
  readonly #events: EventBus<AppEvents> | null;

  constructor({ repository, eventBus = null }: { repository: ProductRepository; eventBus?: EventBus<AppEvents> | null }) {
    this.#repository = repository;
    this.#events = eventBus;
  }

  async lookup(rawCode: string): Promise<LookupResult> {
    const code = String(rawCode ?? '').trim();
    this.#events?.emit('lookup:started', { code });

    const result = await this.#resolve(code);
    this.#events?.emit('lookup:completed', result);
    return result;
  }

  async #resolve(code: string): Promise<LookupResult> {
    let barcode: Barcode;
    try {
      barcode = Barcode.parse(code);
    } catch (err) {
      if (err instanceof InvalidBarcodeError) return { status: 'invalid', code, message: err.reason };
      throw err;
    }

    try {
      const product = await this.#repository.findByBarcode(barcode);
      return product
        ? { status: 'found', code, format: barcode.format, product }
        : { status: 'not-found', code, format: barcode.format };
    } catch (err) {
      return { status: 'error', code, format: barcode.format, message: (err as Error).message };
    }
  }
}
