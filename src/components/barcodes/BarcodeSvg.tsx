import { layoutBarcode, type BarcodeLayoutOptions } from '@/barcodes/barcodeLayout';

interface BarcodeSvgProps extends BarcodeLayoutOptions {
  code: string;
  className?: string;
}

/**
 * A scannable EAN-13 / UPC-A / EAN-8 barcode. Always black on white,
 * because scanners need that contrast (even in dark mode).
 * Works in Server and Client Components (no hooks).
 */
export function BarcodeSvg({ code, className, ...options }: BarcodeSvgProps) {
  const { width, height, barHeight, bars } = layoutBarcode(code, options);
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Barcode ${code}`}>
      <rect width={width} height={height} fill="#fff" />
      <g fill="#000">
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={barHeight} />
        ))}
      </g>
      <text x={width / 2} y={height - 3} textAnchor="middle" fontFamily="monospace" fontSize={15} fill="#000">
        {code}
      </text>
    </svg>
  );
}
