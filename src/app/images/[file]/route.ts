import { getServices } from '@/lib/server/container';
import { handle, json } from '@/lib/server/http';

/**
 * GET /images/:file — product photos stored in DATA_DIR/images.
 * Served by a route (not public/) because photos are uploaded while the app runs.
 */
export const GET = handle(async (_request: Request, ctx: RouteContext<'/images/[file]'>) => {
  const { file } = await ctx.params;
  const image = await getServices().store.readImage(file);
  if (!image) return json({ error: 'Not found' }, 404);

  return new Response(Buffer.from(image.data), {
    headers: {
      'Content-Type': image.contentType,
      // Every upload gets a new file name, so a photo can be cached forever.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
