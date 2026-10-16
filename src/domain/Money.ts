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
