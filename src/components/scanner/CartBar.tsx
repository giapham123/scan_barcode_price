import type { CartSummary } from '@/domain/Cart';
import { config } from '@/lib/config';
import { formatPrice } from '@/lib/format';
import styles from './Scanner.module.css';

interface Props {
  summary: CartSummary;
  notPricedCount: number;
  /** id of the cart section to scroll to. */
  cartId: string;
}

/**
 * Phones: the cart total stays visible at the bottom of the screen while you
 * scan (the cart itself is far down the page). Tap it to jump to the cart.
 * Hidden on wide screens, where the cart is already in view.
 */
export function CartBar({ summary, notPricedCount, cartId }: Props) {
  if (summary.itemCount === 0 && notPricedCount === 0) return null;
  const total = summary.totals.length
    ? summary.totals.map(({ amount, currency }) => formatPrice(amount, currency)).join(' + ')
    : formatPrice(0, config.currency);

  return (
    <button
      type="button"
      className={styles.cartBar}
      onClick={() => document.getElementById(cartId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      aria-label={`Cart: ${summary.itemCount} items, total ${total}. Show cart`}
    >
      <span className={styles.cartBarCount}>
        🛒 {summary.itemCount}
        {notPricedCount > 0 && <span className={styles.cartBarPending}> +{notPricedCount} not priced</span>}
      </span>
      <strong className={styles.cartBarTotal}>{total}</strong>
    </button>
  );
}
