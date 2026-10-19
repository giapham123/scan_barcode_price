import { describe, expect, test } from 'vitest';
import {
  addUnknownScan,
  removeUnknownScan,
  totalUnknown,
  unknownCount,
  type UnknownScans,
} from '@/components/scanner/unknownScans';

describe('unknown scans (barcodes not in the product list yet)', () => {
  test('each scan is counted; the most recently scanned is first', () => {
    let list: UnknownScans = [];
    for (const code of ['111', '222', '111', '333', '111']) list = addUnknownScan(list, code);
    expect(list).toEqual([
      { barcode: '111', count: 3 },
      { barcode: '333', count: 1 },
      { barcode: '222', count: 1 },
    ]);
    expect(unknownCount(list, '111')).toBe(3);
    expect(unknownCount(list, '999')).toBe(0);
    expect(totalUnknown(list)).toBe(5);
  });

  test('removing a barcode (priced or ignored) leaves the others; the input is never changed', () => {
    const list = addUnknownScan(addUnknownScan([], '111'), '222');
    const after = removeUnknownScan(list, '111');
    expect(after).toEqual([{ barcode: '222', count: 1 }]);
    expect(list).toHaveLength(2);
    expect(removeUnknownScan(after, 'nope')).toEqual(after);
  });
});
