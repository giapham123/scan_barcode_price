/**
 * Copies the local catalogue (DATA_DIR, default ./data) into the Netlify Blobs
 * stores used by the deployed site: products and their photos.
 *
 *   BLOBS_SITE_ID=<site id> BLOBS_TOKEN=<personal access token> npm run upload-data
 *
 * Products that already exist online are skipped, so running it again never
 * overwrites prices changed on the site. Add --overwrite to replace them anyway.
 */
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Product } from '@/domain/Product';
import { openNetlifyBlobStores } from '@/lib/server/container';
import { NetlifyBlobsProductStore } from '@/lib/server/NetlifyBlobsProductStore';
import { IMAGE_TYPES } from '@/lib/server/ProductStore';

const CONTENT_TYPE_BY_EXT = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]));

async function main() {
  if (!process.env.BLOBS_SITE_ID || !process.env.BLOBS_TOKEN) {
    throw new Error('Set BLOBS_SITE_ID (Netlify: Project configuration → General → Project ID) and BLOBS_TOKEN (User settings → Applications → Personal access tokens). See README → Deploy to Netlify.');
  }
  const overwrite = process.argv.includes('--overwrite');
  const dataDir = resolve(process.env.DATA_DIR || 'data');
  const rows: unknown[] = JSON.parse(await readFile(join(dataDir, 'products.json'), 'utf8'));

  const stores = openNetlifyBlobStores();
  const store = new NetlifyBlobsProductStore(stores);

  let uploaded = 0;
  let skipped = 0;
  for (const row of rows) {
    const product = Product.fromJSON(row as Record<string, unknown>);
    if (!overwrite && (await store.get(product.barcode))) {
      skipped++;
      continue;
    }
    await store.save(product);

    const fileName = product.imageUrl?.split('/').pop();
    if (fileName) {
      try {
        const data = await readFile(join(dataDir, 'images', fileName));
        await store.setImage(product.barcode, data, CONTENT_TYPE_BY_EXT[extname(fileName)] ?? 'image/jpeg');
      } catch (err) {
        console.warn(`  ! ${product.name}: photo not uploaded (${(err as Error).message})`);
      }
    }
    uploaded++;
    console.log(`  ✓ ${product.name}`);
  }

  console.log(`Done: ${uploaded} uploaded, ${skipped} already online${skipped ? ' (use --overwrite to replace)' : ''}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
