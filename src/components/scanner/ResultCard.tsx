import type { LookupResult } from '@/lib/client/services/PriceLookupService';
import { ProductPhoto } from '@/components/products/ProductPhoto';
import { formatPrice } from '@/lib/format';
import styles from './Scanner.module.css';

export type ResultState = { status: 'idle' } | { status: 'loading'; code: string } | LookupResult;

interface Props {
  result: ResultState;
  /** "Edit price / photo" for found products, "Add product" for unknown ones. */
  onEdit: (result: Extract<LookupResult, { status: 'found' | 'not-found' }>) => void;
}

/** Shows the outcome of the latest scan. */
export function ResultCard({ result, onEdit }: Props) {
  return (
    <div className={styles.result} data-status={result.status} aria-live="polite">
      {result.status === 'found' && result.product.imageUrl && (
        <ProductPhoto src={result.product.imageUrl} alt={result.product.name} sizes="110px" className={styles.resultPhoto} />
      )}
      <div className={styles.resultText}>
        <Description result={result} />
        {(result.status === 'found' || result.status === 'not-found') && (
          <button type="button" className={`button button--ghost ${styles.resultAction}`} onClick={() => onEdit(result)}>
            {result.status === 'found' ? 'Edit price / photo' : 'Add product'}
          </button>
        )}
      </div>
    </div>
  );
}

function Description({ result }: { result: ResultState }) {
  switch (result.status) {
    case 'idle':
      return <p className={styles.resultTitle}>Ready to scan</p>;
    case 'loading':
      return (
        <>
          <p className={styles.resultTitle}>Looking up…</p>
          <p className={styles.resultCode}>{result.code}</p>
        </>
      );
    case 'found': {
      const { product } = result;
      return (
        <>
          <p className={styles.resultTitle}>{product.name}</p>
          <p className={styles.resultPrice}>{formatPrice(product.price, product.currency)}</p>
          {product.unit && <p className={styles.resultMeta}>per {product.unit}</p>}
          <p className={styles.resultCode}>
            {result.code} · {result.format}
          </p>
        </>
      );
    }
    case 'not-found':
      return (
        <>
          <p className={styles.resultTitle}>Product not found</p>
          <p className={styles.resultCode}>
            {result.code} · {result.format}
          </p>
        </>
      );
    case 'invalid':
    case 'error':
      return (
        <>
          <p className={styles.resultTitle}>{result.status === 'invalid' ? 'Invalid barcode' : 'Lookup failed'}</p>
          <p className={styles.resultMeta}>{result.message}</p>
          <p className={styles.resultCode}>{result.code}</p>
        </>
      );
  }
}
