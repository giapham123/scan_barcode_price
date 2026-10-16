import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { internalSequenceOf, makeInternalBarcode } from '@/domain/InternalBarcode';

/**
 * Hands out new in-store barcodes (2000000000015, 2000000000022, ...).
 *
 * The last number used is saved in `barcode-sequence.json`, so a code is
 * never issued twice — even if the product was not saved afterwards, or the
 * server restarted. Codes already used by products are skipped.
 */
export class InternalBarcodeAllocator {
  readonly #file: string;
  readonly #store: { list(): Promise<{ barcode: string }[]> };
  #queue: Promise<unknown> = Promise.resolve();

  constructor({ dataDir, store }: { dataDir: string; store: { list(): Promise<{ barcode: string }[]> } }) {
    this.#file = join(dataDir, 'barcode-sequence.json');
    this.#store = store;
  }

  /** A new, unused EAN-13. */
  next(): Promise<string> {
    // Run one allocation at a time so two phones never get the same code.
    const run = () => this.#allocate();
    const result = this.#queue.then(run, run);
    this.#queue = result.catch(() => {});
    return result;
  }

  async #allocate(): Promise<string> {
    const used = new Set((await this.#store.list()).map((p) => p.barcode));
    const sequences = [...used].map(internalSequenceOf).filter((n): n is number => n !== null);
    const highestUsed = Math.max(0, ...sequences);

    let sequence = Math.max(await this.#readLast(), highestUsed) + 1;
    while (used.has(makeInternalBarcode(sequence))) sequence++;

    await this.#writeLast(sequence);
    return makeInternalBarcode(sequence);
  }

  async #readLast(): Promise<number> {
    try {
      return JSON.parse(await readFile(this.#file, 'utf8')).last ?? 0;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
  }

  async #writeLast(last: number): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true });
    const tmp = `${this.#file}.tmp`;
    await writeFile(tmp, JSON.stringify({ last }) + '\n');
    await rename(tmp, this.#file);
  }
}
