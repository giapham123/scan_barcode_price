import { describe, expect, test } from 'vitest';
import { Barcode } from '@/domain/Barcode';
import { isInternalBarcode } from '@/domain/InternalBarcode';
import {
  BarcodeAllocationError,
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
  StorageTimeoutError,
} from '@/lib/server/errors';
import { NetlifyBlobsProductStore } from '@/lib/server/NetlifyBlobsProductStore';
import { RandomBarcodeAllocator } from '@/lib/server/RandomBarcodeAllocator';
import { withTimeouts } from '@/lib/server/withTimeouts';
import { COLA, GUM, WATER } from './support/fixtures';
import { memoryBlobStore } from './support/memoryBlobStore';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function setup() {
  let clock = 1_700_000_000_000;
  const products = memoryBlobStore();
  const images = memoryBlobStore();
  const store = new NetlifyBlobsProductStore({ products, images, now: () => new Date(clock++) });
  return { store, products, images };
}

describe('NetlifyBlobsProductStore', () => {
  test('save creates, then updates while keeping the photo; list is sorted by name', async () => {
    const { store, products } = setup();
    await store.save({ ...COLA });
    await store.save({ ...GUM });
    await store.setImage(COLA.barcode, JPEG, 'image/jpeg');
    const updated = await store.save({ ...COLA, price: 1.5 });

    expect(updated.price).toBe(1.5);
    expect(updated.imageUrl).toMatch(/^\/images\/5449000000996-\d+\.jpg$/);
    expect([...products.entries.keys()].sort()).toEqual(['product/5449000000996', 'product/96385074']);
    expect((await store.list()).map((p) => p.name)).toEqual(['Chewing Gum', 'Cola 330ml']);
    expect((await store.get(COLA.barcode))?.price).toBe(1.5);
    expect(await store.get('not-a-barcode')).toBeNull();
  });

  test('photos round-trip with their content type; replacing or removing deletes the old one', async () => {
    const { store, images } = setup();
    await store.save({ ...COLA });
    const first = await store.setImage(COLA.barcode, JPEG, 'image/jpeg');
    const second = await store.setImage(COLA.barcode, JPEG, 'image/png');
    const name = second.imageUrl!.split('/').pop()!;

    expect([...images.entries.keys()]).toEqual([name]);
    const read = await store.readImage(name);
    expect(read?.contentType).toBe('image/png');
    expect(read?.data).toEqual(JPEG);
    expect(await store.readImage(first.imageUrl!.split('/').pop()!)).toBeNull();
    expect(await store.readImage('../product/5449000000996')).toBeNull();

    await store.removeImage(COLA.barcode);
    expect(images.entries.size).toBe(0);
  });

  test('rejects invalid data and unknown products', async () => {
    const { store } = setup();
    await expect(store.save({ ...COLA, barcode: '123' })).rejects.toBeInstanceOf(ProductValidationError);
    await expect(store.save({ ...COLA, price: -1 })).rejects.toBeInstanceOf(ProductValidationError);
    await expect(store.setImage(GUM.barcode, JPEG, 'image/jpeg')).rejects.toBeInstanceOf(ProductNotFoundError);
    await store.save({ ...COLA });
    await expect(store.setImage(COLA.barcode, JPEG, 'image/gif')).rejects.toBeInstanceOf(ProductValidationError);
  });

  test('createOnly refuses an existing barcode and never uses conditional writes', async () => {
    const { store, products } = setup();
    const writeOptions: unknown[] = [];
    const original = products.setJSON.bind(products);
    products.setJSON = ((key: string, data: unknown, options?: object) => {
      writeOptions.push(options);
      return original(key, data, options as never);
    }) as typeof products.setJSON;

    await store.save({ ...COLA });
    await expect(store.save({ ...COLA, price: 9 }, { createOnly: true })).rejects.toBeInstanceOf(ProductConflictError);
    expect((await store.get(COLA.barcode))?.price).toBe(1.25);
    await store.save({ ...GUM }, { createOnly: true });
    expect(writeOptions).toEqual([undefined, undefined]); // no onlyIfNew / onlyIfMatch
  });

  test('a missing product or photo is never read directly (that read hangs on Netlify Blobs)', async () => {
    const { store, products, images } = setup();
    const reads: string[] = [];
    for (const blobs of [products, images]) {
      const get = blobs.get.bind(blobs);
      const getWithMetadata = blobs.getWithMetadata.bind(blobs);
      blobs.get = ((key: string, options: never) => (reads.push(key), get(key, options))) as typeof blobs.get;
      blobs.getWithMetadata = ((key: string, options: never) => (reads.push(key), getWithMetadata(key, options))) as typeof blobs.getWithMetadata;
    }

    expect(await store.get(COLA.barcode)).toBeNull();
    expect(await store.readImage('5449000000996-1.jpg')).toBeNull();
    await store.save({ ...COLA }, { createOnly: true });
    expect(reads).toEqual([]); // only list calls so far
    expect((await store.get(COLA.barcode))?.name).toBe('Cola 330ml');
    expect(reads).toEqual(['product/5449000000996']);
  });

  test('barcodes() lists codes in use with a single list call', async () => {
    const { store } = setup();
    await store.save({ ...COLA });
    await store.save({ ...GUM });
    expect(await store.barcodes()).toEqual(new Set([COLA.barcode, GUM.barcode]));
  });

  test('concurrent saves of different products are all kept (one blob per product)', async () => {
    const { store } = setup();
    await Promise.all([store.save({ ...COLA }), store.save({ ...WATER }), store.save({ ...GUM })]);
    expect(await store.list()).toHaveLength(3);
  });
});

describe('RandomBarcodeAllocator', () => {
  test('issues valid in-store EAN-13 codes, skipping codes already in use', async () => {
    const values = [0, 0, 0.5]; // first two draws give the same, used code
    const used = new Set(['2000000000015']);
    const allocator = new RandomBarcodeAllocator({ usedBarcodes: async () => used, random: () => values.shift()! });
    const code = await allocator.next();
    expect(code).not.toBe('2000000000015');
    expect(isInternalBarcode(code)).toBe(true);
    expect(Barcode.parse(code).format).toBe('EAN-13');
  });

  test('gives up with a clear error instead of looping when no free code is drawn', async () => {
    const allocator = new RandomBarcodeAllocator({ usedBarcodes: async () => new Set(['2000000000015']), random: () => 0, maxAttempts: 3 });
    await expect(allocator.next()).rejects.toBeInstanceOf(BarcodeAllocationError);
  });

  test('1000 codes drawn by "different phones" are all different', async () => {
    const codes = await Promise.all(Array.from({ length: 1000 }, () => new RandomBarcodeAllocator({ usedBarcodes: async () => new Set() }).next()));
    expect(new Set(codes).size).toBe(1000);
  });
});

describe('withTimeouts', () => {
  test('a hanging storage call fails with StorageTimeoutError; fast calls pass through', async () => {
    const slow = withTimeouts({ hang: () => new Promise(() => {}), fast: async () => 42, sync: () => 'x' }, 30, 'blobs:test');
    await expect(slow.hang()).rejects.toBeInstanceOf(StorageTimeoutError);
    await expect(slow.hang()).rejects.toThrow(/blobs:test.hang did not answer within 30 ms/);
    expect(await slow.fast()).toBe(42);
    expect(slow.sync()).toBe('x');
  });
});
