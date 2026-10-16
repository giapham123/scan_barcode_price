import { computeGs1CheckDigit } from './Barcode';

/**
 * In-store barcodes for products that come without one.
 *
 * GS1 reserves EAN-13 codes starting with 20–29 for use inside a shop
 * ("restricted circulation"), so they never clash with a manufacturer's code.
 * We use prefix 20 followed by a 10-digit sequence number and the check digit:
 *
 *   20 0000000001 C  ->  2000000000015
 *
 * The result is a normal EAN-13, so every scanner and the label printer
 * handle it like any other barcode.
 */
export const INTERNAL_PREFIX = '20';
const SEQUENCE_DIGITS = 13 - 1 - INTERNAL_PREFIX.length; // 10
export const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

/** @param sequence 1 .. MAX_SEQUENCE */
export function makeInternalBarcode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new RangeError(`Internal barcode sequence out of range: ${sequence}`);
  }
  const data = INTERNAL_PREFIX + String(sequence).padStart(SEQUENCE_DIGITS, '0');
  return data + computeGs1CheckDigit(data);
}

/** True for codes made by makeInternalBarcode. */
export function isInternalBarcode(code: string): boolean {
  return /^\d{13}$/.test(code) && code.startsWith(INTERNAL_PREFIX);
}

/** The sequence number of an internal code, or null. */
export function internalSequenceOf(code: string): number | null {
  return isInternalBarcode(code) ? Number(code.slice(INTERNAL_PREFIX.length, -1)) : null;
}
