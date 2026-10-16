/** Issues new, never-repeated in-store barcodes (see domain/InternalBarcode.ts). */
export interface BarcodeAllocator {
  next(): Promise<string>;
}
