import { encodeEan } from './EanEncoder';

export interface Bar {
  x: number;
  width: number;
}

export interface BarcodeLayout {
  width: number;
  height: number;
  barHeight: number;
  bars: Bar[];
}

export interface BarcodeLayoutOptions {
  /** Width of one bar module in SVG units. */
  moduleWidth?: number;
  barHeight?: number;
  /** Blank modules on each side (scanners need >= 9). */
  quietZone?: number;
  /** Room under the bars for the digits. */
  textHeight?: number;
}

/**
 * Geometry of a scannable barcode, independent of how it is drawn.
 * The <BarcodeSvg> component turns this into SVG.
 */
export function layoutBarcode(
  code: string,
  { moduleWidth = 2, barHeight = 70, quietZone = 11, textHeight = 18 }: BarcodeLayoutOptions = {},
): BarcodeLayout {
  const pattern = encodeEan(code);
  return {
    width: (pattern.length + quietZone * 2) * moduleWidth,
    height: barHeight + textHeight,
    barHeight,
    bars: toBars(pattern).map(({ start, length }) => ({ x: (quietZone + start) * moduleWidth, width: length * moduleWidth })),
  };
}

/** Merge runs of '1' into bars: '0111001' -> [{start:1,length:3},{start:6,length:1}] */
export function toBars(pattern: string): { start: number; length: number }[] {
  return [...pattern.matchAll(/1+/g)].map((match) => ({ start: match.index, length: match[0].length }));
}
