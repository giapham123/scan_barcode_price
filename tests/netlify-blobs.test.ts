import { describe, expect, test } from 'vitest';
import { ProductConflictError, ProductNotFoundError, ProductValidationError } from '@/lib/server/errors';
import { NetlifyBlobsBarcodeAllocator, NetlifyBlobsProductStore } from '@/lib/server/NetlifyBlobsProductStore';
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

  test('createOnly never overwrites: of two racing creates for one barcode, exactly one wins', async () => {
    const { store } = setup();
    const results = await Promise.allSettled([
      store.save({ ...GUM, barcode: '2000000000015', name: 'Cake' }, { createOnly: true }),
      store.save({ ...GUM, barcode: '2000000000015', name: 'Bread' }, { createOnly: true }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ProductConflictError);
  });

  test('concurrent saves of different products are all kept (one blob per product)', async () => {
    const { store } = setup();
    await Promise.all([store.save({ ...COLA }), store.save({ ...WATER }), store.save({ ...GUM })]);
    expect(await store.list()).toHaveLength(3);
  });
});

describe('NetlifyBlobsBarcodeAllocator', () => {
  test('sequential, and skips codes already used by products', async () => {
    const { store } = setup();
    await store.save({ ...GUM, barcode: '2000000000015' });
    const allocator = new NetlifyBlobsBarcodeAllocator({ store: memoryBlobStore(), products: store });
    expect([await allocator.next(), await allocator.next()]).toEqual(['2000000000022', '2000000000039']);
  });

  test('separate instances racing (like several Netlify functions) never get the same code', async () => {
    const { store } = setup();
    const shared = memoryBlobStore();
    // A new allocator per request, as each serverless instance would have.
    const codes = await Promise.all(
      Array.from({ length: 20 }, () => new NetlifyBlobsBarcodeAllocator({ store: shared, products: store }).next()),
    );
    expect(new Set(codes).size).toBe(20);
  });
});
