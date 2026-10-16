import type { CameraScanner, CameraScannerOptions } from './CameraScanner';
import { KeyboardWedgeScanner } from './KeyboardWedgeScanner';
import { NativeCameraScanner } from './NativeCameraScanner';
import { ZxingCameraScanner } from './ZxingCameraScanner';

/**
 * Camera engines in order of preference (Factory pattern).
 * To add one, write a CameraScanner subclass with `static isSupported()` and list it here.
 */
const CAMERA_SCANNERS = [NativeCameraScanner, ZxingCameraScanner];

export const ScannerFactory = {
  /** null when this browser has no camera access at all. */
  createCameraScanner(options: CameraScannerOptions): CameraScanner | null {
    const Scanner = CAMERA_SCANNERS.find((S) => S.isSupported());
    return Scanner ? new Scanner(options) : null;
  },

  createKeyboardScanner(options?: ConstructorParameters<typeof KeyboardWedgeScanner>[0]): KeyboardWedgeScanner {
    return new KeyboardWedgeScanner(options);
  },
};
