import { Product } from '@/domain/Product';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the user cancels the PIN prompt. */
export class AuthCancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'AuthCancelledError';
  }
}

/** Remembers the admin PIN and asks the user for it. */
export interface PinStore {
  get(): string | null;
  /** Ask the user; null = cancelled. */
  ask(message: string): Promise<string | null>;
  clear(): void;
}

export interface ProductInput {
  barcode: string;
  name: string;
  price: number;
  currency: string;
  unit: string;
}

/**
 * Talks to the products API (Gateway). The rest of the app works with
 * Product objects and never builds URLs or headers itself.
 * When a change is refused with 401, it asks for the admin PIN once and retries.
 */
export class ProductApiClient {
  readonly #baseUrl: string;
  readonly #pins: PinStore | null;
  readonly #fetch: typeof fetch;

  constructor({ baseUrl, pinStore = null, fetchFn }: { baseUrl: string; pinStore?: PinStore | null; fetchFn?: typeof fetch }) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#pins = pinStore;
    this.#fetch = fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  async list(): Promise<Product[]> {
    const rows = await this.#request<Record<string, unknown>[]>('GET', '/products');
    return rows.map(Product.fromJSON);
  }

  /** Create or update name / price / currency / unit. */
  async save({ barcode, name, price, currency, unit }: ProductInput): Promise<Product> {
    const data = await this.#request<Record<string, unknown>>('PUT', productPath(barcode), {
      body: JSON.stringify({ name, price, currency, unit }),
      contentType: 'application/json',
    });
    return Product.fromJSON(data);
  }

  /** @param image JPEG / PNG / WebP */
  async uploadImage(barcode: string, image: Blob): Promise<Product> {
    const data = await this.#request<Record<string, unknown>>('PUT', `${productPath(barcode)}/image`, {
      body: image,
      contentType: image.type,
    });
    return Product.fromJSON(data);
  }

  async removeImage(barcode: string): Promise<Product> {
    return Product.fromJSON(await this.#request<Record<string, unknown>>('DELETE', `${productPath(barcode)}/image`));
  }

  /** Ask the server for a new in-store barcode. */
  async allocateBarcode(): Promise<string> {
    return (await this.#request<{ barcode: string }>('POST', '/barcodes/next')).barcode;
  }

  async #request<T>(
    method: string,
    path: string,
    { body, contentType }: { body?: BodyInit; contentType?: string } = {},
    isRetry = false,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;
    const pin = this.#pins?.get();
    if (pin) headers['X-Admin-Pin'] = pin;

    const res = await this.#fetch(this.#baseUrl + path, { method, headers, body });

    if (res.status === 401 && this.#pins && !isRetry) {
      this.#pins.clear();
      const entered = await this.#pins.ask(pin ? 'Wrong PIN. Enter the admin PIN:' : 'Enter the admin PIN to change products:');
      if (!entered) throw new AuthCancelledError();
      return this.#request<T>(method, path, { body, contentType }, true);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`);
    return data as T;
  }
}

function productPath(barcode: string): string {
  return `/products/${encodeURIComponent(barcode)}`;
}
