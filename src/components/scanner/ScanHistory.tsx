import type { LookupResult } from '@/lib/client/services/PriceLookupService';
import { formatPrice, formatTime } from '@/lib/format';
import styles from './Scanner.module.css';

export interface HistoryEntry {
  id: number;
  at: Date;
  result: LookupResult;
}

const STATUS_LABEL = { 'not-found': 'Not found', invalid: 'Invalid', error: 'Error' } as const;

export function ScanHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <section className="card wide">
      <h2>Recent scans</h2>
      {entries.length === 0 && <p className="muted">No scans yet.</p>}
      <ol className={styles.history}>
        {entries.map(({ id, at, result }) => (
          <li key={id} className={styles.historyItem} data-status={result.status}>
            <span className={styles.historyName}>{result.status === 'found' ? result.product.name : result.code}</span>
            <span className={styles.historyPrice}>
              {result.status === 'found' ? formatPrice(result.product.price, result.product.currency) : STATUS_LABEL[result.status]}
            </span>
            <time className={styles.historyTime} dateTime={at.toISOString()}>
              {formatTime(at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
