import { getServices } from '@/lib/server/container';
import { handle, json, requirePin } from '@/lib/server/http';

/** POST /api/barcodes/next — a new in-store barcode for a product that has none. */
export const POST = handle(async (request: Request) => {
  const { allocator, adminPin } = getServices();
  requirePin(request, adminPin);
  return json({ barcode: await allocator.next() }, 201);
});
