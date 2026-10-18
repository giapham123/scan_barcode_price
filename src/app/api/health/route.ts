import { connection } from 'next/server';
import { getServices, openNetlifyBlobStores } from '@/lib/server/container';
import { handle, json, requirePinValue } from '@/lib/server/http';

/**
 * GET /api/health?pin=<admin PIN> — diagnostics for the live site.
 * Runs each storage operation once and reports whether it worked and how long
 * it took, e.g. to see why saving is slow on the hosting platform.
 * Test entries are written under "health/…" and deleted again.
 */
export const GET = handle(async (request: Request) => {
  await connection();
  const { store, adminPin } = getServices();
  requirePinValue(new URL(request.url).searchParams.get('pin'), adminPin);

  const started = Date.now();
  const steps: { step: string; ok: boolean; ms: number; result?: unknown; error?: string }[] = [];
  const step = async (name: string, run: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const result = await run();
      steps.push({ step: name, ok: true, ms: Date.now() - t, result });
    } catch (err) {
      steps.push({ step: name, ok: false, ms: Date.now() - t, error: `${(err as Error).name}: ${(err as Error).message}` });
    }
  };

  await step('list products', async () => `${(await store.list()).length} products`);

  const storage = process.env.STORAGE === 'netlify-blobs' ? 'netlify-blobs' : 'file';
  if (storage === 'netlify-blobs') {
    const { products } = openNetlifyBlobStores();
    const key = `health/${Date.now()}`;
    await step('plain write', async () => (await products.setJSON(`${key}-a`, { at: new Date().toISOString() })).modified);
    await step('read back', async () => Boolean(await products.get(`${key}-a`, { type: 'json' })));
    await step('read a key that does not exist (should be null, fast)', async () => await products.get(`${key}-missing`, { type: 'json' }));
    await step('list a key that does not exist (should be 0)', async () => (await products.list({ prefix: `${key}-missing` })).blobs.length);
    await step('create-only write, new key (should be true)', async () => (await products.setJSON(`${key}-b`, {}, { onlyIfNew: true })).modified);
    await step('create-only write, same key (should be false)', async () => (await products.setJSON(`${key}-b`, {}, { onlyIfNew: true })).modified);
    await step('clean up', async () => {
      await products.delete(`${key}-a`);
      await products.delete(`${key}-b`);
      return 'deleted';
    });
  }

  return json({ storage, totalMs: Date.now() - started, steps });
});
