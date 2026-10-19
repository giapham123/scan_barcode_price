/**
 * Money helpers. Totals are summed in integer minor units (cents, xu...)
 * so 0.1 + 0.2 style floating-point errors never reach the customer.
 */
const digitsCache = new Map<string, number>();

/** Number of decimals a currency uses: USD -> 2, VND -> 0, KWD -> 3. */
export function minorUnitDigits(currency: string): number {
  let digits = digitsCache.get(currency);
  if (digits === undefined) {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    digitsCache.set(currency, digits);
  }
  return digits;
}

/** 1.25 USD -> 125 */
export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorUnitDigits(currency));
}

/** 125 USD -> 1.25 */
export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorUnitDigits(currency);
}

/**
 * Read a price typed by a person, for the given currency.
 *
 *   VND (no decimals):  "15000", "15.000", "15,000", "15 000"  -> 15000
 *   USD (2 decimals):   "1.25", "1,25"                         -> 1.25
 *                       "1,234.50", "1.234,50"                 -> 1234.5
 *
 * @returns the amount, or null if it is not a valid price
 */
export function parsePrice(text: string, currency: string): number | null {
  let value = text.replace(/[\s\u00a0]/g, '');
  if (!/^\d[\d.,]*$/.test(value)) return null;

  if (minorUnitDigits(currency) === 0) {
    // No decimals in this currency: dots and commas can only be thousands separators.
    value = value.replace(/[.,]/g, '');
  } else {
    // The last separator is the decimal one; any others separate thousands.
    const lastSeparator = Math.max(value.lastIndexOf('.'), value.lastIndexOf(','));
    if (lastSeparator >= 0) {
      value = value.slice(0, lastSeparator).replace(/[.,]/g, '') + '.' + value.slice(lastSeparator + 1);
    }
  }

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** A sample price to show in hints, e.g. "15000" for VND, "1.25" for USD. */
export function examplePrice(currency: string): string {
  return minorUnitDigits(currency) === 0 ? '15000' : '1.25';
}
