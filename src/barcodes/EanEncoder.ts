import { Barcode } from '@/domain/Barcode';

/**
 * Turns an EAN-13 / UPC-A / EAN-8 code into its bar pattern:
 * a string of '1' (black module) and '0' (white module).
 *
 * Standard GS1 tables. L = odd parity (left), G = even parity (left), R = right side.
 */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map((bits) => [...bits].map((b) => (b === '1' ? '0' : '1')).join(''));
const G = R.map((bits) => [...bits].reverse().join(''));
const TABLES: Record<string, string[]> = { L, G, R };

/** For EAN-13 the first digit is not drawn; it picks L/G for the next six digits. */
const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

const START = '101';
const MIDDLE = '01010';
const END = '101';

/** @returns module pattern (95 modules for EAN-13/UPC-A, 67 for EAN-8) */
export function encodeEan(code: string): string {
  const barcode = Barcode.parse(code);
  switch (barcode.format) {
    case 'EAN-13':
      return encodeEan13(barcode.value);
    case 'UPC-A':
      return encodeEan13(`0${barcode.value}`); // UPC-A is EAN-13 with a leading 0
    case 'EAN-8':
      return encodeEan8(barcode.value);
    default:
      throw new Error(`No encoder for format ${barcode.format}`);
  }
}

function encodeEan13(value: string): string {
  const parity = EAN13_PARITY[Number(value[0])];
  const left = [...value.slice(1, 7)].map((d, i) => TABLES[parity[i]][Number(d)]).join('');
  const right = [...value.slice(7)].map((d) => R[Number(d)]).join('');
  return START + left + MIDDLE + right + END;
}

function encodeEan8(value: string): string {
  const left = [...value.slice(0, 4)].map((d) => L[Number(d)]).join('');
  const right = [...value.slice(4)].map((d) => R[Number(d)]).join('');
  return START + left + MIDDLE + right + END;
}
