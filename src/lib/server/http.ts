import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { unstable_rethrow } from 'next/navigation';
import { BarcodeAllocationError, HttpError, ProductConflictError, ProductNotFoundError, ProductValidationError } from './errors';

export const MAX_JSON_BYTES = 64 * 1024;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Wraps a route handler: any thrown error becomes a JSON error response
 * with the right status, so handlers only contain the happy path.
 */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      unstable_rethrow(err); // let Next.js's own control-flow errors (e.g. from connection()) through
      const httpError = toHttpError(err);
      if (httpError.status >= 500) console.error(err);
      return json({ error: httpError.status >= 500 ? 'Internal server error' : httpError.message }, httpError.status);
    }
  };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Writes need the `X-Admin-Pin` header when an admin PIN is configured. */
export function requirePin(request: Request, adminPin: string | null): void {
  if (!adminPin) return;
  const given = Buffer.from(request.headers.get('x-admin-pin') ?? '');
  const expected = Buffer.from(adminPin);
  const ok = given.length === expected.length && timingSafeEqual(given, expected);
  if (!ok) throw new HttpError(401, 'Wrong or missing admin PIN');
}

/** Read the request body, refusing anything larger than `limitBytes` (also while streaming). */
export async function readBody(request: Request, limitBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new HttpError(413, `Body too large (max ${limitBytes} bytes)`);
  if (Number(request.headers.get('content-length')) > limitBytes) throw tooLarge();
  if (!request.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > limitBytes) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await readBody(request, MAX_JSON_BYTES);
  try {
    const data = JSON.parse(Buffer.from(body).toString('utf8'));
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('not an object');
    return data;
  } catch {
    throw new HttpError(400, 'Body must be a JSON object');
  }
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ProductNotFoundError) return new HttpError(404, err.message);
  if (err instanceof ProductValidationError) return new HttpError(400, err.message);
  if (err instanceof ProductConflictError) return new HttpError(409, err.message);
  if (err instanceof BarcodeAllocationError) return new HttpError(503, err.message);
  return new HttpError(500, 'Internal server error');
}
