import type { CartSummary } from '@/domain/Cart';
import { ProductPhoto } from '@/components/products/ProductPhoto';
import { config } from '@/lib/config';
import { formatPrice } from '@/lib/format';
import styles from './Scanner.module.css';

interface Props {
  summary: CartSummary;
  /** Scanned items still waiting for a price (see UnknownScansPanel); not in the total. */
  notPricedCount?: number;
  /** The line that was just scanned; `seq` changes on every scan to replay the highlight. */
  flash: { barcode: string; seq: number } | null;
  onIncrement: (barcode: string) => void;
  onDecrement: (barcode: string) => void;
  onRemove: (barcode: string) => void;
  onClear: () => void;
}

export function CartPanel({ summary, notPricedCount = 0, flash, onIncrement, onDecrement, onRemove, onClear }: Props) {
  const { lines, itemCount, totals } = summary;
  const total = totals.length
    ? totals.map(({ amount, currency }) => formatPrice(amount, currency)).join(' + ')
    : formatPrice(0, config.currency);

  return (
    <section className="card wide" aria-label="Cart">
      <div className={styles.cartHeader}>
        <h2>
          Cart <span className={styles.cartCount}>{itemCount === 1 ? '1 item' : `${itemCount} items`}</span>
        </h2>
        <button type="button" className="button button--ghost" onClick={onClear} disabled={lines.length === 0}>
          Clear
        </button>
      </div>

      {lines.length === 0 && <p className="muted">Scan products to add them here.</p>}

      <ul className={styles.cartLines}>
        {lines.map(({ product, quantity, lineTotal }) => {
          const flashed = flash?.barcode === product.barcode;
          return (
            <li
              // A new key on each scan remounts the row, which replays the highlight animation.
              key={flashed ? `${product.barcode}-${flash.seq}` : product.barcode}
              className={`${styles.cartLine} ${flashed ? styles.flash : ''}`}
            >
              <ProductPhoto src={product.imageUrl} alt={product.name} sizes="48px" className={styles.cartPhoto} placeholder="" />
              <div className={styles.cartInfo}>
                <span className={styles.cartName}>{product.name}</span>
                <span className={styles.cartUnit}>
                  {formatPrice(product.price, product.currency)}
                  {product.unit && ` / ${product.unit}`}
                </span>
              </div>
              <div className={styles.cartQty}>
                <button type="button" className={styles.round} onClick={() => onDecrement(product.barcode)} aria-label={`Remove one ${product.name}`}>
                  −
                </button>
                <span className={styles.cartCountValue}>{quantity}</span>
                <button type="button" className={styles.round} onClick={() => onIncrement(product.barcode)} aria-label={`Add one ${product.name}`}>
                  +
                </button>
              </div>
              <span className={styles.cartLineTotal}>{formatPrice(lineTotal, product.currency)}</span>
              <button type="button" className={styles.cartRemove} onClick={() => onRemove(product.barcode)} aria-label={`Remove ${product.name}`}>
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.cartTotal}>
        <span>Total</span>
        <strong aria-live="polite">{total}</strong>
      </div>
      {notPricedCount > 0 && (
        <p className={styles.notPriced}>
          + {notPricedCount === 1 ? '1 item' : `${notPricedCount} items`} not priced yet (see “Not in your list”)
        </p>
      )}
    </section>
  );
}
