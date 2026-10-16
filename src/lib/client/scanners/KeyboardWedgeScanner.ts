import type { BarcodeScanner } from './BarcodeScanner';

interface KeyEventTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEventLike) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEventLike) => void): void;
}
interface KeyboardEventLike {
  key: string;
  target: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}

/**
 * Supports USB / Bluetooth handheld barcode guns.
 *
 * These devices act like a keyboard: they "type" the code very fast and then
 * press Enter. We collect characters that arrive within `maxKeyIntervalMs` of
 * each other, which separates a scanner from a human typing.
 *
 * Keys typed into an <input>/<textarea> are ignored so forms keep working normally.
 */
export class KeyboardWedgeScanner implements BarcodeScanner {
  readonly name = 'Handheld scanner';
  readonly #target: KeyEventTarget;
  readonly #maxKeyIntervalMs: number;
  readonly #minLength: number;
  readonly #now: () => number;
  #buffer = '';
  #lastKeyAt = -Infinity;
  #onCode: ((code: string) => void) | null = null;

  constructor({
    target = globalThis as unknown as KeyEventTarget,
    maxKeyIntervalMs = 50,
    minLength = 6,
    now = () => performance.now(),
  }: { target?: KeyEventTarget; maxKeyIntervalMs?: number; minLength?: number; now?: () => number } = {}) {
    this.#target = target;
    this.#maxKeyIntervalMs = maxKeyIntervalMs;
    this.#minLength = minLength;
    this.#now = now;
  }

  async start(onCode: (code: string) => void): Promise<void> {
    if (this.#onCode) return;
    this.#onCode = onCode;
    this.#target.addEventListener('keydown', this.#handleKeyDown);
  }

  async stop(): Promise<void> {
    this.#target.removeEventListener('keydown', this.#handleKeyDown);
    this.#onCode = null;
    this.#buffer = '';
  }

  #handleKeyDown = (event: KeyboardEventLike): void => {
    if (isEditable(event.target)) return;

    const t = this.#now();
    if (t - this.#lastKeyAt > this.#maxKeyIntervalMs) this.#buffer = '';
    this.#lastKeyAt = t;

    if (event.key === 'Enter') {
      const code = this.#buffer;
      this.#buffer = '';
      if (code.length >= this.#minLength) this.#onCode?.(code);
      return;
    }
    if (event.key?.length === 1) this.#buffer += event.key;
  };
}

function isEditable(el: KeyboardEventLike['target']): boolean {
  const node = el as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = node?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node?.isContentEditable === true;
}
