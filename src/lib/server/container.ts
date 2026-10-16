import 'server-only';
import { resolve } from 'node:path';
import { FileProductStore } from './FileProductStore';
import { InternalBarcodeAllocator } from './InternalBarcodeAllocator';
import type { ProductStore } from './ProductStore';

/**
 * Composition root for the server: the only place that picks concrete classes.
 *
 * Environment variables (put them in .env.local):
 *   DATA_DIR   where products.json and images/ live (default ./data)
 *   ADMIN_PIN  when set, changing products requires this PIN
 */
export interface ServerServices {
  store: ProductStore;
  allocator: InternalBarcodeAllocator;
  adminPin: string | null;
}

function createServices(): ServerServices {
  // Runtime folder (live data), not part of the build – hence the turbopackIgnore hint.
  const dataDir = resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || 'data');
  const store = new FileProductStore({ dataDir });
  return {
    store,
    allocator: new InternalBarcodeAllocator({ dataDir, store }),
    adminPin: process.env.ADMIN_PIN || null,
  };
}

// Next.js may bundle each route separately and reloads modules in dev.
// Keeping ONE instance per process on globalThis guarantees a single write
// queue and a single barcode allocator, so saves never overwrite each other.
const globalForServices = globalThis as typeof globalThis & { __priceScannerServices?: ServerServices };

export function getServices(): ServerServices {
  return (globalForServices.__priceScannerServices ??= createServices());
}

/** Tests only: swap in services that use a temporary folder. */
export function setServicesForTesting(services: ServerServices | undefined): void {
  globalForServices.__priceScannerServices = services;
}
