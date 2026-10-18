import { Barcode } from '@/domain/Barcode';
import { isRestrictedCirculation } from '@/domain/InternalBarcode';
import { CatalogUnavailableError } from '@/lib/server/catalog/ProductCatalog';
import { getServices } from '@/lib/server/container';
import { HttpError } from '@/lib/server/errors';
import { handle, json } from '@/lib/server/http';

/**
 * GET /api/catalog/:barcode — what online product databases know about a barcode
 * (name, brand, photo; never a price). `null` when unknown, 503 when the database
 * cannot be reached right now.
 * "Not found" is a normal answer here, so it is 200 with `null` rather than 404:
 * Netlify treats a 404 as a missing page and retries the URL with ".html" (slow, wrong).
 */
export const GET = handle(async (_request: Request, ctx: RouteContext<'/api/catalog/[barcode]'>) => {
  const { barcode } = await ctx.params;
  if (!Barcode.isValid(barcode)) throw new HttpError(400, 'Invalid barcode');
  // Shop-internal codes (20…29) mean something different in every shop.
  if (isRestrictedCirculation(barcode)) return json(null);

  try {
    return json(await getServices().catalog.lookup(barcode));
  } catch (err) {
    if (err instanceof CatalogUnavailableError) throw new HttpError(503, 'The online product database is not available right now');
    throw err;
  }
});
