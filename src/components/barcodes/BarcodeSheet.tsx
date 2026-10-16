'use client';

import { useEffect, useState } from 'react';
import type { ProductData } from '@/domain/Product';
import { ProductTag } from './ProductTag';
import styles from './BarcodeSheet.module.css';

/** Placements used by "Mixed positions": rotation (deg) and size. */
const MIXED_PLACEMENTS = [
  { rotate: 0, scale: 1 },
  { rotate: 90, scale: 0.8 },
  { rotate: 180, scale: 1 },
  { rotate: -12, scale: 0.9 },
  { rotate: 15, scale: 0.9 },
  { rotate: -90, scale: 0.8 },
  { rotate: 6, scale: 0.75 },
];

interface Props {
  products: ProductData[];
  /** Showing only specific labels (from "Print label"). */
  labelsOnly: boolean;
  /** Open the print dialog once the photos have loaded. */
  autoPrint: boolean;
}

export function BarcodeSheet({ products, labelsOnly, autoPrint }: Props) {
  const [order, setOrder] = useState(products);
  const [mixed, setMixed] = useState(false);

  useEffect(() => {
    if (!autoPrint || products.length === 0) return;
    let cancelled = false;
    const images = [...document.querySelectorAll<HTMLImageElement>(`.${styles.sheet} img`)];
    void Promise.all(images.map((img) => img.decode().catch(() => {}))).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrint, products.length]);

  const status = labelsOnly
    ? `Label for ${products.map((p) => p.name).join(', ') || 'unknown product'}`
    : `${products.length} products`;

  return (
    <>
      <header className={styles.toolbar}>
        <div>
          <h1>Test barcodes</h1>
          <p>Fake products from the product list. Show this page on a screen or print it, then scan it with your phone.</p>
        </div>
        <div className={styles.actions}>
          <label className={styles.switch}>
            <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />
            Mixed positions
          </label>
          <button type="button" className="button" onClick={() => setOrder(shuffle)}>
            Shuffle
          </button>
          <button type="button" className="button" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      <p className={styles.status}>{status}</p>

      <main className={`${styles.sheet} ${mixed ? styles.mixed : ''}`}>
        {order.map((product, i) => {
          const placement = mixed ? MIXED_PLACEMENTS[i % MIXED_PLACEMENTS.length] : MIXED_PLACEMENTS[0];
          return <ProductTag key={product.barcode} product={product} {...placement} />;
        })}
      </main>
    </>
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
