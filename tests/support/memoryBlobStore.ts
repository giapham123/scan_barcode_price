import type { BlobStore } from '@/lib/server/NetlifyBlobsProductStore';

/**
 * In-memory stand-in for a Netlify Blobs store with the same semantics for the
 * methods the app uses, including create-only writes (`onlyIfNew`).
 * Every call yields to the event loop first, so concurrent callers interleave
 * like real network requests.
 */
export function memoryBlobStore() {
  const entries = new Map<string, { data: string | ArrayBuffer; metadata: Record<string, unknown> }>();
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));

  const write = async (key: string, data: string | ArrayBuffer, options: { onlyIfNew?: boolean; metadata?: Record<string, unknown> } = {}) => {
    await tick();
    if (options.onlyIfNew && entries.has(key)) return { modified: false };
    entries.set(key, { data, metadata: options.metadata ?? {} });
    return { modified: true, etag: String(Math.random()) };
  };
  const read = (key: string, type?: string) => {
    const entry = entries.get(key);
    if (!entry) return null;
    if (type === 'json') return JSON.parse(entry.data as string);
    if (type === 'arrayBuffer') return entry.data;
    return entry.data;
  };

  const store = {
    entries,
    async get(key: string, options: { type?: string } = {}) {
      await tick();
      return read(key, options.type);
    },
    async getWithMetadata(key: string, options: { type?: string } = {}) {
      await tick();
      const entry = entries.get(key);
      return entry ? { data: read(key, options.type), metadata: entry.metadata, etag: 'x' } : null;
    },
    set: (key: string, data: string | ArrayBuffer, options?: { onlyIfNew?: boolean; metadata?: Record<string, unknown> }) =>
      write(key, data, options),
    setJSON: (key: string, data: unknown, options?: { onlyIfNew?: boolean }) => write(key, JSON.stringify(data), options),
    async list({ prefix = '' }: { prefix?: string } = {}) {
      await tick();
      return { blobs: [...entries.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: 'x' })), directories: [] };
    },
    async delete(key: string) {
      await tick();
      entries.delete(key);
    },
  };
  return store as unknown as BlobStore & { entries: typeof entries };
}
