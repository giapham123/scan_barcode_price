/**
 * Cameras report the same barcode many times per second while it stays in
 * view. This filter lets each code through ONCE while it is visible:
 *
 * - every sighting refreshes that code's "last seen" time;
 * - the code is accepted again only after it has been out of view for
 *   `cooldownMs` (e.g. the product was taken away and shown again).
 *
 * Codes are tracked independently, so several barcodes in the same frame
 * are each counted once.
 */
export class ScanDeduplicator {
  readonly #cooldownMs: number;
  readonly #now: () => number;
  readonly #lastSeen = new Map<string, number>();

  constructor({ cooldownMs = 2000, now = Date.now }: { cooldownMs?: number; now?: () => number } = {}) {
    this.#cooldownMs = cooldownMs;
    this.#now = now;
  }

  /** @returns true if the code should be processed */
  accept(code: string): boolean {
    const t = this.#now();
    this.#forgetOlderThan(t - this.#cooldownMs);

    const isNew = !this.#lastSeen.has(code);
    this.#lastSeen.set(code, t);
    return isNew;
  }

  reset(): void {
    this.#lastSeen.clear();
  }

  #forgetOlderThan(limit: number): void {
    for (const [code, seenAt] of this.#lastSeen) {
      if (seenAt < limit) this.#lastSeen.delete(code);
    }
  }
}
