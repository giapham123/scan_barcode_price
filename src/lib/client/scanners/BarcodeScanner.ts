/**
 * Scanner contract (Strategy pattern).
 *
 * Every input method — phone camera, USB/Bluetooth barcode gun, etc. —
 * implements the same two methods, so the app can switch between them
 * freely and the lookup logic never knows where a code came from.
 */
export interface BarcodeScanner {
  /** Human readable name shown in the UI. */
  readonly name: string;
  /** Begin listening; `onCode` is called once per detected code. */
  start(onCode: (code: string) => void): Promise<void>;
  /** Release camera / listeners. Safe to call more than once. */
  stop(): Promise<void>;
}
