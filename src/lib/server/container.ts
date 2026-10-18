import 'server-only';
import { resolve } from 'node:path';
import { getStore } from '@netlify/blobs';
import type { BarcodeAllocator } from './BarcodeAllocator';
import { CatalogImageImporter } from './catalog/CatalogImageImporter';
import { OPEN_FACTS_DATABASES, OPEN_FACTS_IMAGE_HOSTS, OpenFactsCatalog } from './catalog/OpenFactsCatalog';
import { CachedCatalog, FallbackCatalog, type ProductCatalog } from './catalog/ProductCatalog';
import { MAX_IMAGE_BYTES } from './http';
import { FileProductStore } from './FileProductStore';
import { InternalBarcodeAllocator } from './InternalBarcodeAllocator';
import { NetlifyBlobsProductStore } from './NetlifyBlobsProductStore';
import { RandomBarcodeAllocator } from './RandomBarcodeAllocator';
import { withTimeouts } from './withTimeouts';
import type { ProductStore } from './ProductStore';

/**
 * Composition root for the server: the only place that picks concrete classes.
 *
 * Environment variables:
 *   STORAGE    "file" (own server/PC, default) or "netlify-blobs" (Netlify).
 *              Decided at build time in next.config.ts; Netlify builds pick Blobs automatically.
 *   DATA_DIR   file storage only: folder with products.json and images/ (default ./data)
 *   ADMIN_PIN  when set, changing products requires this PIN
 *   CATALOG_CONTACT  optional contact (email or URL) sent to Open Food Facts in the
 *              User-Agent, as their API rules ask; defaults to the project's GitHub page
 */
export interface ServerServices {
  store: ProductStore;
  allocator: BarcodeAllocator;
  adminPin: string | null;
  /** Online product databases used to pre-fill new products. */
  catalog: ProductCatalog;
  catalogImages: CatalogImageImporter;
}

function createCatalog(): Pick<ServerServices, 'catalog' | 'catalogImages'> {
  const contact = process.env.CATALOG_CONTACT || '+https://github.com/giapham123/scan_barcode_price';
  const userAgent = `PriceScanner/1.0 (${contact})`;
  const sources = [OPEN_FACTS_DATABASES.food, OPEN_FACTS_DATABASES.products];
  return {
    catalog: new CachedCatalog(new FallbackCatalog(sources.map((db) => new OpenFactsCatalog({ ...db, userAgent })))),
    catalogImages: new CatalogImageImporter({ allowedHosts: OPEN_FACTS_IMAGE_HOSTS, maxBytes: MAX_IMAGE_BYTES, userAgent }),
  };
}

function createServices(): ServerServices {
  const adminPin = process.env.ADMIN_PIN || null;

  if (process.env.STORAGE === 'netlify-blobs') {
    const stores = openNetlifyBlobStores();
    const store = new NetlifyBlobsProductStore(stores);
    const allocator = new RandomBarcodeAllocator({ usedBarcodes: () => store.barcodes() });
    return { store, allocator, adminPin, ...createCatalog() };
  }

  // Runtime folder (live data), not part of the build – hence the turbopackIgnore hint.
  const dataDir = resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || 'data');
  const store = new FileProductStore({ dataDir });
  return { store, allocator: new InternalBarcodeAllocator({ dataDir, store }), adminPin, ...createCatalog() };
}

/**
 * The two Netlify Blobs stores the app uses, with strong consistency so a
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
  // Each call is limited to 5 s, so a hanging request becomes a readable 503, not a bare 504.
  const open = (name: string) => withTimeouts(getStore({ name, consistency: 'strong', ...credentials }), 5000, `blobs:${name}`);
  return { products: open('products'), images: open('product-images') };
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
