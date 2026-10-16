import { CameraScanner, type CameraScannerOptions } from './CameraScanner';

// Keep in sync with BARCODE_FORMATS in domain/Barcode.ts.
const WANTED_FORMATS = ['ean_13', 'ean_8', 'upc_a'];

/** The Shape Detection API is not in TypeScript's DOM types yet. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}
const detectorClass = () => (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;

/**
 * Uses the browser's built-in BarcodeDetector.
 * Fast and dependency-free; available on Chrome/Edge for Android, macOS, ChromeOS.
 */
export class NativeCameraScanner extends CameraScanner {
  readonly name = 'Camera (native)';
  readonly #intervalMs: number;
  #detector: BarcodeDetectorLike | null = null;
  #stream: MediaStream | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  static isSupported(): boolean {
    return !!detectorClass() && !!globalThis.navigator?.mediaDevices?.getUserMedia;
  }

  /** @param options.intervalMs how often a frame is analysed */
  constructor({ intervalMs = 150, ...options }: CameraScannerOptions & { intervalMs?: number }) {
    super(options);
    this.#intervalMs = intervalMs;
  }

  protected async startDecoding(): Promise<void> {
    const Detector = detectorClass()!;
    const supported = await Detector.getSupportedFormats();
    this.#detector = new Detector({ formats: WANTED_FORMATS.filter((f) => supported.includes(f)) });

    this.#stream = await navigator.mediaDevices.getUserMedia(this.constraints);
    this.video.srcObject = this.#stream;
    await this.video.play();
    this.#scheduleNextFrame();
  }

  protected async stopDecoding(): Promise<void> {
    clearTimeout(this.#timer);
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.video.srcObject = null;
  }

  #scheduleNextFrame(): void {
    this.#timer = setTimeout(() => this.#analyseFrame(), this.#intervalMs);
  }

  async #analyseFrame(): Promise<void> {
    if (!this.isRunning) return;
    try {
      // Several barcodes can be in view at once – report every one of them.
      const detected = await this.#detector!.detect(this.video);
      for (const { rawValue } of detected) this.report(rawValue);
    } catch {
      // Frame not ready yet (e.g. video still loading) – just try the next one.
    }
    if (this.isRunning) this.#scheduleNextFrame();
  }
}
