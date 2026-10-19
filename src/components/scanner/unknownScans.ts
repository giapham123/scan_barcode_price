/**
 * Barcodes scanned during this session that are not in the product list yet.
 * They are collected (and counted) so you can keep scanning, and price them
 * all afterwards. Pure functions, used with React state.
 */
export interface UnknownScan {
  barcode: string;
  /** How many times it was scanned – becomes the cart quantity once priced. */
  count: number;
}

export type UnknownScans = readonly UnknownScan[];

/** Count one more scan of `barcode`; the most recently scanned is listed first. */
export function addUnknownScan(list: UnknownScans, barcode: string): UnknownScans {
  const existing = list.find((item) => item.barcode === barcode);
  return [{ barcode, count: (existing?.count ?? 0) + 1 }, ...list.filter((item) => item !== existing)];
}

export function removeUnknownScan(list: UnknownScans, barcode: string): UnknownScans {
  return list.filter((item) => item.barcode !== barcode);
}

/** How many times `barcode` was scanned while unknown (0 if not in the list). */
export function unknownCount(list: UnknownScans, barcode: string): number {
  return list.find((item) => item.barcode === barcode)?.count ?? 0;
}

/** Total number of scanned items still waiting for a price. */
export function totalUnknown(list: UnknownScans): number {
  return list.reduce((sum, item) => sum + item.count, 0);
}
