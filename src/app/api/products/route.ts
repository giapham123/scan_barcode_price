import { connection } from 'next/server';
import { getServices } from '@/lib/server/container';
import { handle, json } from '@/lib/server/http';

/** GET /api/products — all products, sorted by name. */
export const GET = handle(async () => {
  await connection(); // always read the current list, never a build-time copy
  return json(await getServices().store.list());
});
