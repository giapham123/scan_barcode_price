'use client';

import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Barcode } from '@/domain/Barcode';
import { Product, type ProductData } from '@/domain/Product';
import { useAppEvent } from '@/components/providers/ServicesProvider';
import { formatPrice } from '@/lib/format';
import { ProductPhoto } from './ProductPhoto';
import { useProductEditor } from './ProductEditorProvider';
import type { EditRequest } from './ProductEditorDialog';
import styles from './ProductsScreen.module.css';

/** List, search, add and edit products. The first list comes from the server. */
export function ProductsScreen({ initialProducts }: { initialProducts: ProductData[] }) {
  const editProduct = useProductEditor();
  const [products, setProducts] = useState(() => initialProducts.map(Product.fromJSON));
  // Also picks up changes that finish later, e.g. a photo copied from the online database.
  useAppEvent('product:saved', (saved) => setProducts((list) => [...list.filter((p) => p.barcode !== saved.barcode), saved]));
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));
    return q ? sorted.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q)) : sorted;
  }, [products, query]);

  async function edit(request: EditRequest) {
    const saved = await editProduct(request);
    if (!saved) return;
    setProducts((list) => [...list.filter((p) => p.barcode !== saved.barcode), saved]);
    setQuery('');
  }

  /** Enter in the search box (typed or from a handheld scanner): open that product, or offer to add it. */
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    const exact = products.find((p) => p.barcode === text);
    if (exact) return void edit({ product: exact });
    if (visible.length === 1) return void edit({ product: visible[0] });
    if (Barcode.isValid(text)) return void edit({ barcode: text });
  }

  const total = products.length;
  const status = total === 0 ? 'No products yet. Add one!' : visible.length === total ? `${total} products` : `${visible.length} of ${total} products`;

  return (
    <section className="card">
      <form className={styles.toolbar} onSubmit={submitSearch} autoComplete="off">
        <input
          type="search"
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or barcode…"
          aria-label="Search products"
        />
        <button type="button" className="button" onClick={() => void edit({})}>
          Add product
        </button>
      </form>
      <p className={styles.status} aria-live="polite">
        {status}
      </p>

      <ul className={styles.list}>
        {visible.map((product) => (
          <ProductRow key={product.barcode} product={product} onOpen={() => void edit({ product })} />
        ))}
      </ul>
    </section>
  );
}

function ProductRow({ product, onOpen }: { product: Product; onOpen: () => void }) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <li className={styles.row} role="button" tabIndex={0} aria-label={`Edit ${product.name}`} onClick={onOpen} onKeyDown={onKeyDown}>
      <ProductPhoto src={product.imageUrl} alt={product.name} sizes="56px" className={styles.photo} />
      <div className={styles.info}>
        <span className={styles.name}>{product.name}</span>
        <span className={styles.barcode}>{product.barcode}</span>
      </div>
      <div className={styles.price}>
        <strong>{formatPrice(product.price, product.currency)}</strong>
        <span className="muted">{product.unit && `per ${product.unit}`}</span>
      </div>
    </li>
  );
}
