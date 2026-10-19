/**
 * Converts product prices from one currency to another with a fixed rate.
 *
 *   npm run convert-currency -- --rate 25000                 preview only (changes nothing)
 *   npm run convert-currency -- --rate 25000 --apply         convert data/ on this PC
 *   npm run convert-currency -- --rate 25000 --apply --netlify
 *        convert the live Netlify site (needs BLOBS_SITE_ID and BLOBS_TOKEN, see README)
 *
 * Options: --from USD (default) --to VND (default) --round 500 (default: round to 500 ₫)
 * Only products in the --from currency are changed; photos and other fields are kept.
 * With file storage, products.json is backed up first.
 */
import { copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getServices } from '@/lib/server/container';
import { formatPrice } from '@/lib/format';

function option(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const rate = Number(option('rate'));
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Give the rate, e.g. --rate 25000 (1 USD = 25000 VND).');
  const from = option('from', 'USD')!.toUpperCase();
  const to = option('to', 'VND')!.toUpperCase();
  const round = Number(option('round', to === 'VND' ? '500' : '0.01'));
  const apply = process.argv.includes('--apply');
  const netlify = process.argv.includes('--netlify');

  if (netlify) {
    if (!process.env.BLOBS_SITE_ID || !process.env.BLOBS_TOKEN) throw new Error('--netlify needs BLOBS_SITE_ID and BLOBS_TOKEN (see README → Deploy to Netlify).');
    process.env.STORAGE = 'netlify-blobs';
  }
  const { store } = getServices();
  const products = (await store.list()).filter((p) => p.currency === from);

  console.log(`${netlify ? 'Netlify site' : 'data/ on this PC'}: ${products.length} product(s) in ${from}, 1 ${from} = ${rate} ${to}, rounded to ${round}\n`);
  if (products.length === 0) return;

  if (apply && !netlify) {
    const dataDir = resolve(process.env.DATA_DIR || 'data');
    const backup = join(dataDir, `products.backup-${Date.now()}.json`);
    await copyFile(join(dataDir, 'products.json'), backup);
    console.log(`Backup: ${backup}\n`);
  }

  for (const product of products) {
    const price = Math.round((product.price * rate) / round) * round;
    console.log(`  ${product.name.padEnd(28)} ${formatPrice(product.price, from).padStart(10)}  ->  ${formatPrice(price, to)}`);
    if (apply) await store.save({ ...product.toJSON(), price: Number(price.toFixed(6)), currency: to });
  }

  console.log(apply ? `\nDone: ${products.length} product(s) converted.` : '\nPreview only. Add --apply to convert.');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
