import { randomInternalBarcode } from '@/domain/InternalBarcode';
import type { BarcodeAllocator } from './BarcodeAllocator';
import { BarcodeAllocationError } from './errors';

/**
 * Issues random in-store barcodes, skipping codes products already use.
 *
 * Needs only ONE read (the list of used barcodes) and no write at all, so it
 * works on serverless hosting without a shared counter or atomic writes.
 * (Netlify Blobs' create-only writes timed out in production → HTTP 504.)
 * The product is then saved create-only, as a second safeguard.
 */
export class RandomBarcodeAllocator implements BarcodeAllocator {
  readonly #usedBarcodes: () => Promise<Set<string>>;
  readonly #random: () => number;
  readonly #maxAttempts: number;

  constructor({
    usedBarcodes,
    random = Math.random,
    maxAttempts = 10,
  }: {
    usedBarcodes: () => Promise<Set<string>>;
    random?: () => number;
    maxAttempts?: number;
  }) {
    this.#usedBarcodes = usedBarcodes;
    this.#random = random;
    this.#maxAttempts = maxAttempts;
  }

  async next(): Promise<string> {
    const used = await this.#usedBarcodes();
    for (let attempt = 0; attempt < this.#maxAttempts; attempt++) {
      const code = randomInternalBarcode(this.#random);
      if (!used.has(code)) return code;
    }
    throw new BarcodeAllocationError('Could not pick a free barcode. Please try again.');
  }
}
