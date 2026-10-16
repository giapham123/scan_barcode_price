import 'server-only';
import { resolve } from 'node:path';
import { getStore } from '@netlify/blobs';
import type { BarcodeAllocator } from './BarcodeAllocator';
import { FileProductStore } from './FileProductStore';
import { InternalBarcodeAllocator } from './InternalBarcodeAllocator';
import { NetlifyBlobsBarcodeAllocator, NetlifyBlobsProductStore } from './NetlifyBlobsProductStore';
import type { ProductStore } from './ProductStore';

/**
 * Composition root for the server: the only place that picks concrete classes.
 *
 * Environment variables:
 *   STORAGE    "file" (own server/PC, default) or "netlify-blobs" (Netlify).
 *              Decided at build time in next.config.ts; Netlify builds pick Blobs automatically.
 *   DATA_DIR   file storage only: folder with products.json and images/ (default ./data)
 *   ADMIN_PIN  when set, changing products requires this PIN
 */
export interface ServerServices {
  store: ProductStore;
  allocator: BarcodeAllocator;
  adminPin: string | null;
}

function createServices(): ServerServices {
  const adminPin = process.env.ADMIN_PIN || null;

  if (process.env.STORAGE === 'netlify-blobs') {
    const stores = openNetlifyBlobStores();
    const store = new NetlifyBlobsProductStore(stores);
    return { store, allocator: new NetlifyBlobsBarcodeAllocator({ store: stores.sequence, products: store }), adminPin };
  }

  // Runtime folder (live data), not part of the build – hence the turbopackIgnore hint.
  const dataDir = resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || 'data');
  const store = new FileProductStore({ dataDir });
  return { store, allocator: new InternalBarcodeAllocator({ dataDir, store }), adminPin };
}

/**
 * The three Netlify Blobs stores the app uses, with strong consistency so a
 * saved price is visible on the very next request.
 *
 * On Netlify the credentials are normally provided automatically. If you see
 * "MissingBlobsEnvironmentError", set BLOBS_SITE_ID and BLOBS_TOKEN (a Netlify
 * personal access token) as environment variables; they are then used explicitly.
 * The data upload script uses the same two variables.
 */
export function openNetlifyBlobStores() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  const credentials = siteID && token ? { siteID, token } : {};
  const open = (name: string) => getStore({ name, consistency: 'strong', ...credentials });
  return { products: open('products'), images: open('product-images'), sequence: open('barcode-sequence') };
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
