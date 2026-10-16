import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ProductsScreen } from '@/components/products/ProductsScreen';
import { getServices } from '@/lib/server/container';

export const metadata: Metadata = { title: 'Products' };

export default function ProductsPage() {
  return (
    <>
      <header className="page-header">
        <h1>Products</h1>
        <p>
          Change prices and photos. Type or scan a barcode in the search box and press Enter to open it. For an item
          without a barcode, tap <strong>Add product</strong> → <strong>No barcode? Create one</strong>.
        </p>
      </header>
      <main className="layout layout--single">
        <Suspense fallback={<section className="card muted">Loading products…</section>}>
          <ProductList />
        </Suspense>
      </main>
    </>
  );
}

/** Reads the products on the server, so the list is in the first HTML. */
async function ProductList() {
  await connection(); // always the current list, never a build-time copy
  const products = await getServices().store.list();
  return <ProductsScreen initialProducts={products.map((p) => p.toJSON())} />;
}
