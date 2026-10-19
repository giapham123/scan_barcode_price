import { HttpError } from '../errors';
import { IMAGE_TYPES } from '../ProductStore';

/**
 * Downloads a product photo from an online catalog so it can be stored as the
 * product's own photo (the browser cannot do this itself because of CORS).
 *
 * Only URLs on the allowed image hosts are fetched, over HTTPS, with a size
 * and time limit – otherwise this endpoint could be abused to make the server
 * fetch arbitrary addresses (SSRF).
 */
export class CatalogImageImporter {
  readonly #allowedHosts: Set<string>;
  readonly #maxBytes: number;
  readonly #userAgent: string;
  readonly #fetch: typeof fetch;

  constructor({
    allowedHosts,
    maxBytes,
    userAgent,
    fetchFn,
  }: {
    allowedHosts: string[];
    maxBytes: number;
    userAgent: string;
    fetchFn?: typeof fetch;
  }) {
    this.#allowedHosts = new Set(allowedHosts);
    this.#maxBytes = maxBytes;
    this.#userAgent = userAgent;
    this.#fetch = fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  isAllowed(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      return url.protocol === 'https:' && this.#allowedHosts.has(url.hostname) && !url.username && !url.password && !url.port;
    } catch {
      return false;
    }
  }

  async download(rawUrl: string): Promise<{ data: Uint8Array; contentType: string }> {
    if (!this.isAllowed(rawUrl)) throw new HttpError(400, 'Photos can only be imported from the online product database');

    let res: Response;
    try {
      // redirect: 'error' – a redirect could lead to a host that is not allowed.
      res = await this.#fetch(rawUrl, { headers: { 'User-Agent': this.#userAgent }, redirect: 'error', signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new HttpError(502, 'Could not download the photo');
    }
    if (!res.ok) throw new HttpError(502, `Could not download the photo (HTTP ${res.status})`);

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!IMAGE_TYPES[contentType]) throw new HttpError(502, 'The online photo is not a JPEG, PNG or WebP image');
    if (Number(res.headers.get('content-length')) > this.#maxBytes) throw new HttpError(502, 'The online photo is too large');

    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > this.#maxBytes) throw new HttpError(502, 'The online photo is empty or too large');
    return { data, contentType };
  }
}
