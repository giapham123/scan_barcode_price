import type { BarcodeScanner } from './BarcodeScanner';
import { ScanDeduplicator } from './ScanDeduplicator';

export interface CameraScannerOptions {
  /** Element that shows the camera preview. */
  video: HTMLVideoElement;
  /** A code held in view is counted once; again only after being away this long. */
  cooldownMs?: number;
}

/**
 * Shared camera handling (Template Method pattern).
 * Subclasses only implement how frames are decoded: `startDecoding()` and
 * `stopDecoding()`. Duplicate filtering and lifecycle live here.
 */
export abstract class CameraScanner implements BarcodeScanner {
  abstract readonly name: string;
  protected readonly video: HTMLVideoElement;
  readonly #dedup: ScanDeduplicator;
  #onCode: ((code: string) => void) | null = null;
  #running = false;

  constructor({ video, cooldownMs = 2000 }: CameraScannerOptions) {
    this.video = video;
    this.#dedup = new ScanDeduplicator({ cooldownMs });
  }

  get isRunning(): boolean {
    return this.#running;
  }

  async start(onCode: (code: string) => void): Promise<void> {
    if (this.#running) return;
    this.#onCode = onCode;
    this.#dedup.reset();
    await this.startDecoding();
    this.#running = true;
  }

  async stop(): Promise<void> {
    if (!this.#running) return;
    this.#running = false;
    await this.stopDecoding();
  }

  /** Subclasses call this for every decoded value. */
  protected report(code: string | null | undefined): void {
    if (this.#running && code && this.#dedup.accept(code)) this.#onCode?.(code);
  }

  /** Default camera request: rear camera, decent resolution. */
  protected get constraints(): MediaStreamConstraints {
    return {
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    };
  }

  protected abstract startDecoding(): Promise<void>;
  protected abstract stopDecoding(): Promise<void>;
}
