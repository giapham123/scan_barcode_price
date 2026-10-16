import { describe, expect, test } from 'vitest';
import { layoutBarcode, toBars } from '@/barcodes/barcodeLayout';
import { encodeEan } from '@/barcodes/EanEncoder';
import { Barcode } from '@/domain/Barcode';
import { makeInternalBarcode } from '@/domain/InternalBarcode';

/**
 * Independent decoder used only to check the encoder: reads the bar pattern
 * back into digits using the GS1 rules.
 */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const invert = (s: string) => [...s].map((b) => (b === '1' ? '0' : '1')).join('');
const reverse = (s: string) => [...s].reverse().join('');

function decode(pattern: string): string {
  const half = (pattern.length - 11) / 14; // digits per side
  const chunk = (from: number, i: number) => pattern.slice(from + i * 7, from + i * 7 + 7);
  const left: [number, string][] = [];
  for (let i = 0; i < half; i++) {
    const bits = chunk(3, i);
    const l = L.indexOf(bits);
    left.push(l >= 0 ? [l, 'L'] : [L.indexOf(invert(reverse(bits))), 'G']); // G = reversed, inverted L
  }
  const right: number[] = [];
  for (let i = 0; i < half; i++) right.push(L.indexOf(invert(chunk(3 + half * 7 + 5, i))));

  const leftDigits = left.map(([d]) => d).join('');
  if (half === 4) return leftDigits + right.join('');
  return PARITY.indexOf(left.map(([, p]) => p).join('')) + leftDigits + right.join('');
}

const SAMPLE_CODES = [
  '8934588012112', '5449000000996', '8935002123452', '4006381333931', '7613034900906',
  '036000291452', '012345678905', '96385074', '8936123456788', '8936987654320',
  '40071350', makeInternalBarcode(1), makeInternalBarcode(987654),
];

describe('EAN encoder', () => {
  test('EAN-13 has 95 modules with start, middle and end guards', () => {
    const p = encodeEan('5449000000996');
    expect(p).toHaveLength(95);
    expect(p.slice(0, 3)).toBe('101');
    expect(p.slice(45, 50)).toBe('01010');
    expect(p.slice(-3)).toBe('101');
  });

  test('EAN-8 has 67 modules; UPC-A is EAN-13 with a leading zero', () => {
    expect(encodeEan('96385074')).toHaveLength(67);
    expect(encodeEan('036000291452')).toBe(encodeEan('0036000291452'));
  });

  test.each(SAMPLE_CODES)('%s encodes and decodes back', (code) => {
    const expected = Barcode.parse(code).format === 'UPC-A' ? `0${code}` : code;
    expect(decode(encodeEan(code))).toBe(expected);
  });

  test('refuses invalid codes', () => {
    expect(() => encodeEan('5449000000997')).toThrow(/check digit/);
  });
});

describe('barcode layout', () => {
  test('toBars merges runs of black modules', () => {
    expect(toBars('0111001')).toEqual([
      { start: 1, length: 3 },
      { start: 6, length: 1 },
    ]);
  });

  test('one bar per black run, inside the quiet zones', () => {
    const layout = layoutBarcode('96385074', { moduleWidth: 2, quietZone: 11 });
    expect(layout.bars).toHaveLength(toBars(encodeEan('96385074')).length);
    expect(layout.width).toBe((67 + 22) * 2);
    expect(layout.bars[0].x).toBe(22);
    const last = layout.bars.at(-1)!;
    expect(last.x + last.width).toBe(layout.width - 22);
  });
});
