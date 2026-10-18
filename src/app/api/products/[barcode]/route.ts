import { getServices } from '@/lib/server/container';
import { handle, json, readJson, requirePin } from '@/lib/server/http';

/**
 * GET /api/products/:barcode — one product, or `null` if the barcode is not in the list.
 * "Not found" is a normal answer here, so it is 200 with `null` rather than 404:
 * Netlify treats a 404 as a missing page and retries the URL with ".html" (slow, wrong).
 */
export const GET = handle(async (_request: Request, ctx: RouteContext<'/api/products/[barcode]'>) => {
  const { barcode } = await ctx.params;
  return json(await getServices().store.get(barcode));
});

/**
 * PUT /api/products/:barcode — create or update { name, price, currency, unit }.
 * With the header `If-None-Match: *` it only creates: 409 if the barcode is already used.
 */
export const PUT = handle(async (request: Request, ctx: RouteContext<'/api/products/[barcode]'>) => {
  const { store, adminPin } = getServices();
  requirePin(request, adminPin);
  const { barcode } = await ctx.params;
  const body = await readJson(request);
  const details = {
    barcode,
    name: String(body.name ?? ''),
    price: Number(body.price),
    currency: String(body.currency ?? ''),
    unit: body.unit == null ? '' : String(body.unit),
  };
  return json(await store.save(details, { createOnly: request.headers.get('if-none-match') === '*' }));
});
