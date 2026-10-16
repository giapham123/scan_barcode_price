import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as barcodesNext from '@/app/api/barcodes/next/route';
import * as productImage from '@/app/api/products/[barcode]/image/route';
import * as productOne from '@/app/api/products/[barcode]/route';
import * as images from '@/app/images/[file]/route';
import { setServicesForTesting } from '@/lib/server/container';
import { ProductNotFoundError, ProductValidationError } from '@/lib/server/errors';
import { FileProductStore } from '@/lib/server/FileProductStore';
import { MAX_IMAGE_BYTES } from '@/lib/server/http';
import { InternalBarcodeAllocator } from '@/lib/server/InternalBarcodeAllocator';
import { COLA, GUM, WATER } from './support/fixtures';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

let dataDir: string;
let clock: number;
const now = () => new Date(clock++);

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'price-scanner-'));
  clock = 1_700_000_000_000;
  await writeFile(join(dataDir, 'products.json'), JSON.stringify([COLA, WATER]));
});
afterEach(async () => {
  setServicesForTesting(undefined);
  await rm(dataDir, { recursive: true, force: true });
});

describe('FileProductStore', () => {
  test('save creates, then updates while keeping the photo; the file is rewritten', async () => {
    const store = new FileProductStore({ dataDir, now });
    await store.save({ ...GUM });
    await store.setImage(GUM.barcode, JPEG, 'image/jpeg');
    const updated = await store.save({ ...GUM, price: 0.8 });

    expect(updated.price).toBe(0.8);
    expect(updated.imageUrl).toMatch(/^\/images\/96385074-\d+\.jpg$/);
    const onDisk = JSON.parse(await readFile(join(dataDir, 'products.json'), 'utf8'));
    expect(onDisk.map((p: { name: string }) => p.name)).toEqual(['Cola 330ml', 'Mineral Water 500ml', 'Chewing Gum']);
    expect((await store.list()).map((p) => p.name)).toEqual(['Chewing Gum', 'Cola 330ml', 'Mineral Water 500ml']);
  });

  test('replacing or removing a photo deletes the old file; photos can be read back', async () => {
    const store = new FileProductStore({ dataDir, now });
    const first = await store.setImage(COLA.barcode, JPEG, 'image/jpeg');
    const second = await store.setImage(COLA.barcode, JPEG, 'image/png');
    expect(await readdir(join(dataDir, 'images'))).toEqual([second.imageUrl!.split('/').pop()]);
    expect((await store.readImage(second.imageUrl!.split('/').pop()!))?.contentType).toBe('image/png');
    expect(await store.readImage(first.imageUrl!.split('/').pop()!)).toBeNull();

    await store.removeImage(COLA.barcode);
    expect(await readdir(join(dataDir, 'images'))).toEqual([]);
  });

  test('rejects invalid data, unknown products and unsafe file names', async () => {
    const store = new FileProductStore({ dataDir, now });
    await expect(store.save({ ...COLA, barcode: '123' })).rejects.toBeInstanceOf(ProductValidationError);
    await expect(store.save({ ...COLA, name: '' })).rejects.toBeInstanceOf(ProductValidationError);
    await expect(store.save({ ...COLA, price: -1 })).rejects.toBeInstanceOf(ProductValidationError);
    await expect(store.setImage(GUM.barcode, JPEG, 'image/jpeg')).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(store.setImage(COLA.barcode, JPEG, 'image/gif')).rejects.toBeInstanceOf(ProductValidationError);
    expect(await store.readImage('../products.json')).toBeNull();
  });

  test('concurrent saves are all written', async () => {
    const store = new FileProductStore({ dataDir, now });
    await Promise.all([store.save({ ...GUM }), store.save({ ...COLA, price: 2 }), store.save({ ...WATER, price: 1 })]);
    const reloaded = new FileProductStore({ dataDir });
    expect((await reloaded.list()).map((p) => [p.name, p.price])).toEqual([
      ['Chewing Gum', 0.75],
      ['Cola 330ml', 2],
      ['Mineral Water 500ml', 1],
    ]);
  });
});

describe('InternalBarcodeAllocator', () => {
  test('sequential, never repeats, survives a restart', async () => {
    const store = new FileProductStore({ dataDir });
    const a = new InternalBarcodeAllocator({ dataDir, store });
    expect([await a.next(), await a.next()]).toEqual(['2000000000015', '2000000000022']);
    const afterRestart = new InternalBarcodeAllocator({ dataDir, store: new FileProductStore({ dataDir }) });
    expect(await afterRestart.next()).toBe('2000000000039');
  });

  test('skips codes already used by products (e.g. typed in by hand)', async () => {
    const store = new FileProductStore({ dataDir });
    await store.save({ ...GUM, barcode: '2000000000015' });
    await store.save({ ...GUM, barcode: '2000000000022' });
    expect(await new InternalBarcodeAllocator({ dataDir, store }).next()).toBe('2000000000039');
  });

  test('simultaneous requests from several phones get different codes', async () => {
    const allocator = new InternalBarcodeAllocator({ dataDir, store: new FileProductStore({ dataDir }) });
    const codes = await Promise.all(Array.from({ length: 20 }, () => allocator.next()));
    expect(new Set(codes).size).toBe(20);
  });
});

describe('API route handlers', () => {
  const PIN = '1234';
  const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) }) as never;
  const req = (method: string, { pin, body, type }: { pin?: string; body?: BodyInit; type?: string } = {}) =>
    new Request('http://localhost/api', {
      method,
      body,
      headers: { ...(pin ? { 'X-Admin-Pin': pin } : {}), ...(type ? { 'Content-Type': type } : {}) },
    });

  beforeEach(() => {
    const store = new FileProductStore({ dataDir, now });
    setServicesForTesting({ store, allocator: new InternalBarcodeAllocator({ dataDir, store }), adminPin: PIN });
  });

  test('get one product; 404 for an unknown one', async () => {
    const ok = await productOne.GET(req('GET'), params({ barcode: COLA.barcode }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).name).toBe('Cola 330ml');
    expect((await productOne.GET(req('GET'), params({ barcode: GUM.barcode }))).status).toBe(404);
  });

  test('changes need the admin PIN', async () => {
    const body = JSON.stringify({ name: 'Cola', price: 2, currency: 'USD' });
    expect((await productOne.PUT(req('PUT', { body }), params({ barcode: COLA.barcode }))).status).toBe(401);
    expect((await productOne.PUT(req('PUT', { body, pin: '9999' }), params({ barcode: COLA.barcode }))).status).toBe(401);
    expect((await barcodesNext.POST(req('POST'))).status).toBe(401);
    expect((await productImage.DELETE(req('DELETE'), params({ barcode: COLA.barcode }))).status).toBe(401);
  });

  test('add a product; validation errors are 400 with a message', async () => {
    const created = await productOne.PUT(
      req('PUT', { pin: PIN, body: JSON.stringify({ name: 'Gum', price: '0.75', currency: 'usd', unit: 'pack' }) }),
      params({ barcode: GUM.barcode }),
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ barcode: GUM.barcode, price: 0.75, currency: 'USD' });

    const bad = await productOne.PUT(req('PUT', { pin: PIN, body: JSON.stringify({ name: '', price: 1, currency: 'USD' }) }), params({ barcode: GUM.barcode }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/name/);
    expect((await productOne.PUT(req('PUT', { pin: PIN, body: 'not json' }), params({ barcode: GUM.barcode }))).status).toBe(400);
    expect((await productOne.PUT(req('PUT', { pin: PIN, body: '{}' }), params({ barcode: '123' }))).status).toBe(400);
  });

  test('photo upload is stored and served; bad types and sizes are refused', async () => {
    const upload = await productImage.PUT(req('PUT', { pin: PIN, body: JPEG, type: 'image/jpeg' }), params({ barcode: COLA.barcode }));
    expect(upload.status).toBe(200);
    const { imageUrl } = await upload.json();

    const served = await images.GET(req('GET'), params({ file: imageUrl.split('/').pop() }));
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(JPEG);

    expect((await images.GET(req('GET'), params({ file: '..%2Fproducts.json' }))).status).toBe(404);
    expect((await productImage.PUT(req('PUT', { pin: PIN, body: 'gif', type: 'image/gif' }), params({ barcode: COLA.barcode }))).status).toBe(415);
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    expect((await productImage.PUT(req('PUT', { pin: PIN, body: huge, type: 'image/jpeg' }), params({ barcode: COLA.barcode }))).status).toBe(413);
    expect((await productImage.PUT(req('PUT', { pin: PIN, body: JPEG, type: 'image/jpeg' }), params({ barcode: GUM.barcode }))).status).toBe(404);
  });

  test('POST /api/barcodes/next returns a new in-store code', async () => {
    const res = await barcodesNext.POST(req('POST', { pin: PIN }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ barcode: '2000000000015' });
  });
});
