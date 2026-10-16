import { CameraScanner } from './CameraScanner';

/**
 * Fallback for browsers without BarcodeDetector (iPhone Safari, Firefox, Chrome on Windows).
 * Wraps the ZXing library behind our CameraScanner interface (Adapter pattern).
 * The library is downloaded only when the camera is first started.
 */
export class ZxingCameraScanner extends CameraScanner {
  readonly name = 'Camera (ZXing)';
  #controls: { stop(): void } | null = null;

  static isSupported(): boolean {
    return !!globalThis.navigator?.mediaDevices?.getUserMedia;
  }

  protected async startDecoding(): Promise<void> {
    const [{ BrowserMultiFormatOneDReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);

    const hints = new Map<number, unknown>([
      // Keep in sync with BARCODE_FORMATS in domain/Barcode.ts.
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
      // Also tries the frame rotated 90°, so sideways barcodes are read too.
      [DecodeHintType.TRY_HARDER, true],
    ]);

    const reader = new BrowserMultiFormatOneDReader(hints);
    this.#controls = await reader.decodeFromConstraints(this.constraints, this.video, (result) => {
      if (result) this.report(result.getText());
    });
  }

  protected async stopDecoding(): Promise<void> {
    this.#controls?.stop();
    this.#controls = null;
  }
}
