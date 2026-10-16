import { getServices } from '@/lib/server/container';
import { HttpError } from '@/lib/server/errors';
import { handle, json, readJson, requirePin } from '@/lib/server/http';

/** GET /api/products/:barcode — one product, 404 if unknown. */
export const GET = handle(async (_request: Request, ctx: RouteContext<'/api/products/[barcode]'>) => {
  const { barcode } = await ctx.params;
  const product = await getServices().store.get(barcode);
  if (!product) throw new HttpError(404, `Product ${barcode} not found`);
  return json(product);
});

/** PUT /api/products/:barcode — create or update { name, price, currency, unit }. */
export const PUT = handle(async (request: Request, ctx: RouteContext<'/api/products/[barcode]'>) => {
  const { store, adminPin } = getServices();
  requirePin(request, adminPin);
  const { barcode } = await ctx.params;
  const body = await readJson(request);
  return json(
    await store.save({
      barcode,
      name: String(body.name ?? ''),
      price: Number(body.price),
      currency: String(body.currency ?? ''),
      unit: body.unit == null ? '' : String(body.unit),
    }),
  );
});
