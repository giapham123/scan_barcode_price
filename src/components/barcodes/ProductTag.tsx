import type { CSSProperties } from 'react';
import type { ProductData } from '@/domain/Product';
import { ProductPhoto } from '@/components/products/ProductPhoto';
import { formatPrice } from '@/lib/format';
import { BarcodeSvg } from './BarcodeSvg';
import styles from './ProductTag.module.css';

interface ProductTagProps {
  product: ProductData;
  /** Rotation in degrees and size factor, used by "Mixed positions". */
  rotate?: number;
  scale?: number;
}

/** Printable price tag: photo, barcode, name and price. Used on the test sheet and as a label. */
export function ProductTag({ product, rotate = 0, scale = 1 }: ProductTagProps) {
  const placement = { '--rotate': `${rotate}deg`, '--scale': scale } as CSSProperties;
  return (
    <figure className={styles.tag} style={placement}>
      <ProductPhoto
        src={product.imageUrl ?? null}
        alt={product.name}
        sizes="300px"
        className={styles.photo}
        placeholder="No photo"
      />
      <BarcodeSvg code={product.barcode} className={styles.barcode} />
      <figcaption className={styles.caption}>
        <span className={styles.name}>{product.name}</span>
        <span className={styles.price}>{formatPrice(product.price, product.currency)}</span>
      </figcaption>
    </figure>
  );
}
