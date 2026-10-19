'use client';

import { ProductPhoto } from '@/components/products/ProductPhoto';
import { useCatalogLookup } from '@/components/products/useCatalogLookup';
import type { UnknownScan, UnknownScans } from './unknownScans';
import styles from './Scanner.module.css';

interface Props {
  items: UnknownScans;
  /** Open the "Add product" form (pre-filled from the online database). */
  onAdd: (barcode: string) => void;
  onDismiss: (barcode: string) => void;
}

/**
 * Scanned barcodes that are not in the product list yet. Keep scanning;
 * price them here afterwards and they join the cart with their scan count.
 */
export function UnknownScansPanel({ items, onAdd, onDismiss }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="card wide" aria-label="Not in your list">
      <h2>
        Not in your list <span className={styles.cartCount}>{items.length === 1 ? '1 product' : `${items.length} products`}</span>
      </h2>
      <p className="muted">Keep scanning. Add a price for each one here; it then goes into the cart.</p>
      <ul className={styles.cartLines}>
        {items.map((item) => (
          <UnknownRow key={item.barcode} item={item} onAdd={onAdd} onDismiss={onDismiss} />
        ))}
      </ul>
    </section>
  );
}

function UnknownRow({ item, onAdd, onDismiss }: { item: UnknownScan; onAdd: Props['onAdd']; onDismiss: Props['onDismiss'] }) {
  // Name and photo from the online database, if it knows the product (cached on the server).
  const online = useCatalogLookup(item.barcode);
  const entry = online.status === 'found' ? online.entry : null;
  const name = entry?.name ?? (online.status === 'loading' ? 'Looking up…' : 'Unknown product');

  return (
    <li className={styles.unknownLine}>
      <ProductPhoto src={entry?.imageUrl ?? null} alt={name} sizes="48px" className={styles.cartPhoto} placeholder="?" />
      <div className={styles.cartInfo}>
        <span className={styles.cartName}>{name}</span>
        <span className={styles.cartUnit}>
          <span className={styles.mono}>{item.barcode}</span>
          {item.count > 1 && ` · scanned ×${item.count}`}
        </span>
      </div>
      <button type="button" className={`button ${styles.unknownAdd}`} onClick={() => onAdd(item.barcode)}>
        Add price
      </button>
      <button type="button" className={styles.cartRemove} onClick={() => onDismiss(item.barcode)} aria-label={`Ignore ${item.barcode}`}>
        ×
      </button>
    </li>
  );
}
