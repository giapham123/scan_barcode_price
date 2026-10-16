import { ScannerScreen } from '@/components/scanner/ScannerScreen';

export default function ScannerPage() {
  return (
    <>
      <header className="page-header">
        <h1>Price Scanner</h1>
        <p>Scan barcodes with the camera, a handheld scanner, or type them in. Each product found is added to the cart.</p>
      </header>
      <ScannerScreen />
    </>
  );
}
