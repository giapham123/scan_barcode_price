import { getServices } from '@/lib/server/container';
import { HttpError } from '@/lib/server/errors';
import { handle, json, MAX_IMAGE_BYTES, readBody, requirePin } from '@/lib/server/http';
import { IMAGE_TYPES } from '@/lib/server/ProductStore';

/** PUT /api/products/:barcode/image — upload the photo (raw body, Content-Type image/jpeg|png|webp). */
export const PUT = handle(async (request: Request, ctx: RouteContext<'/api/products/[barcode]/image'>) => {
  const { store, adminPin } = getServices();
  requirePin(request, adminPin);

  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!IMAGE_TYPES[type]) throw new HttpError(415, 'Photo must be JPEG, PNG or WebP');
  const data = await readBody(request, MAX_IMAGE_BYTES);
  if (data.byteLength === 0) throw new HttpError(400, 'Photo is empty');

  const { barcode } = await ctx.params;
  return json(await store.setImage(barcode, data, type));
});

/** DELETE /api/products/:barcode/image — remove the photo. */
export const DELETE = handle(async (request: Request, ctx: RouteContext<'/api/products/[barcode]/image'>) => {
  const { store, adminPin } = getServices();
  requirePin(request, adminPin);
  const { barcode } = await ctx.params;
  return json(await store.removeImage(barcode));
});
