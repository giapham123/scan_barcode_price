import { Barcode } from '@/domain/Barcode';
import { isRestrictedCirculation } from '@/domain/InternalBarcode';
import { CatalogUnavailableError } from '@/lib/server/catalog/ProductCatalog';
import { getServices } from '@/lib/server/container';
import { HttpError } from '@/lib/server/errors';
import { handle, json } from '@/lib/server/http';

/**
 * GET /api/catalog/:barcode — what online product databases know about a barcode
 * (name, brand, photo; never a price). 404 when unknown, 503 when the database
 * cannot be reached right now.
 */
export const GET = handle(async (_request: Request, ctx: RouteContext<'/api/catalog/[barcode]'>) => {
  const { barcode } = await ctx.params;
  if (!Barcode.isValid(barcode)) throw new HttpError(400, 'Invalid barcode');
  // Shop-internal codes (20…29) mean something different in every shop.
  if (isRestrictedCirculation(barcode)) throw new HttpError(404, 'In-store barcodes are not in online databases');

  try {
    const entry = await getServices().catalog.lookup(barcode);
    if (!entry) throw new HttpError(404, 'Not found in the online product database');
    return json(entry);
  } catch (err) {
    if (err instanceof CatalogUnavailableError) throw new HttpError(503, 'The online product database is not available right now');
    throw err;
  }
});
