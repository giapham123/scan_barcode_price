/**
 * Barcode value object.
 *
 * Supported formats are kept in a registry (BARCODE_FORMATS) so a new format
 * can be added by appending one entry, without touching the parsing logic.
 */

export class InvalidBarcodeError extends Error {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super(`Invalid barcode "${raw}": ${reason}`);
    this.name = 'InvalidBarcodeError';
  }
}

export interface BarcodeFormat {
  name: string;
  matches(value: string): boolean;
  isValid(value: string): boolean;
}

/**
 * GS1 check digit (used by EAN-8, UPC-A, EAN-13).
 * Weights 3,1,3,1... are applied from the rightmost data digit.
 * @param dataDigits digits WITHOUT the check digit
 */
export function computeGs1CheckDigit(dataDigits: string): number {
  let sum = 0;
  for (let i = 0; i < dataDigits.length; i++) {
    const digit = Number(dataDigits[dataDigits.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidGs1CheckDigit(value: string): boolean {
  return computeGs1CheckDigit(value.slice(0, -1)) === Number(value.at(-1));
}

const gs1Format = (name: string, length: number): BarcodeFormat => ({
  name,
  matches: (value) => value.length === length && /^\d+$/.test(value),
  isValid: hasValidGs1CheckDigit,
});

/** Registry of supported formats. Order matters: first match wins. */
export const BARCODE_FORMATS: readonly BarcodeFormat[] = Object.freeze([
  gs1Format('EAN-13', 13),
  gs1Format('UPC-A', 12),
  gs1Format('EAN-8', 8),
]);

export class Barcode {
  private constructor(
    readonly value: string,
    readonly format: string,
  ) {
    Object.freeze(this);
  }

  /**
   * Parse and validate a raw scanned string.
   * @throws {InvalidBarcodeError}
   */
  static parse(raw: unknown, formats: readonly BarcodeFormat[] = BARCODE_FORMATS): Barcode {
    const value = String(raw ?? '').trim();
    if (value === '') throw new InvalidBarcodeError(value, 'empty value');

    const format = formats.find((f) => f.matches(value));
    if (!format) throw new InvalidBarcodeError(value, 'unsupported format');
    if (!format.isValid(value)) throw new InvalidBarcodeError(value, 'wrong check digit');

    return new Barcode(value, format.name);
  }

  /** @returns true when `raw` is a valid barcode. */
  static isValid(raw: unknown): boolean {
    try {
      Barcode.parse(raw);
      return true;
    } catch {
      return false;
    }
  }

  equals(other: unknown): boolean {
    return other instanceof Barcode && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
