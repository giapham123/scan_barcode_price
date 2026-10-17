import { getServices } from '@/lib/server/container';
import { HttpError } from '@/lib/server/errors';
import { handle, json, readJson, requirePin } from '@/lib/server/http';

/**
 * POST /api/products/:barcode/image/import { url } — use a photo from the online
 * product database as the product's photo. The server downloads and stores it;
 * only the database's own image hosts are allowed.
 */
export const POST = handle(async (request: Request, ctx: RouteContext<'/api/products/[barcode]/image/import'>) => {
  const { store, catalogImages, adminPin } = getServices();
  requirePin(request, adminPin);
  const { url } = await readJson(request);
  if (typeof url !== 'string') throw new HttpError(400, 'Body must be { "url": "…" }');

  const { barcode } = await ctx.params;
  if (!(await store.get(barcode))) throw new HttpError(404, `Product ${barcode} not found`);
  const image = await catalogImages.download(url);
  return json(await store.setImage(barcode, image.data, image.contentType));
});
