import { minorUnitDigits, parsePrice } from './Money';

/**
 * How a price is typed in the form, per currency.
 *
 * With the thousands shortcut (VND): you type 15 and it means 15.000 ₫, the
 * way prices are usually written in Vietnam. 15,5 or 15.5 means 15.500 ₫.
 */
export interface PriceInputMode {
  /** Typed number × multiplier = price (1000 with the thousands shortcut). */
  multiplier: number;
  /** Shown right after the field, e.g. ".000" – the zeros you no longer type. */
  suffix: string | null;
  /** Placeholder / example, e.g. "15". */
  example: string;
  /** Which phone keyboard to open. */
  keyboard: 'decimal' | 'numeric';
}

export function priceInputMode(currency: string, thousandsShortcut: boolean): PriceInputMode {
  if (minorUnitDigits(currency) === 0) {
    return thousandsShortcut
      ? { multiplier: 1000, suffix: '.000', example: '15', keyboard: 'decimal' } // decimal: allows 15,5
      : { multiplier: 1, suffix: null, example: '15000', keyboard: 'numeric' };
  }
  return { multiplier: 1, suffix: null, example: '1.25', keyboard: 'decimal' };
}

/** The price for what was typed, or null if it is not a valid price. */
export function readPriceInput(text: string, currency: string, mode: PriceInputMode): number | null {
  if (mode.multiplier === 1) return parsePrice(text, currency);
  // Thousands: "15" -> 15000, "15,5" / "15.5" -> 15500 (the separator is a decimal point here).
  const thousands = parsePrice(text, 'USD'); // any currency with decimals: last separator = decimal point
  return thousands === null ? null : Math.round(thousands * mode.multiplier);
}

/** What to put in the field for an existing price: 31500 -> "31.5" with the thousands shortcut. */
export function writePriceInput(amount: number, mode: PriceInputMode): string {
  return String(Number((amount / mode.multiplier).toFixed(6)));
}
