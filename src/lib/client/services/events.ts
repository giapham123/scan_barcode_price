import type { Product } from '@/domain/Product';
import type { LookupResult } from './PriceLookupService';

/** Every event the browser services publish, with its payload type. */
export type AppEvents = {
  'lookup:started': { code: string };
  'lookup:completed': LookupResult;
  /** A product's details or photo were saved. */
  'product:saved': Product;
  /** A product without a barcode was given a new in-store one (time to print a label). */
  'product:barcode-created': Product;
};
