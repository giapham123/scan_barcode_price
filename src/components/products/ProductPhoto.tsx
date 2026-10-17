import Image from 'next/image';
import styles from './ProductPhoto.module.css';

interface ProductPhotoProps {
  /** Stored photo URL ("/images/…"), a local preview (blob: URL), or null. */
  src: string | null;
  alt: string;
  /** Size hint for the image optimiser, e.g. "48px" or "(max-width: 600px) 100vw, 400px". */
  sizes: string;
  className?: string;
  /** "cover" crops to fill the box; "contain" shows the whole photo. */
  fit?: 'cover' | 'contain';
  placeholder?: string;
  /** Load at once instead of when scrolled into view (e.g. inside a dialog). */
  eager?: boolean;
}

/**
 * Photo of the real product, so staff can check it matches what they hold.
 * The box size comes from `className`; the photo fills it.
 */
export function ProductPhoto({ src, alt, sizes, className = '', fit = 'cover', placeholder = 'No photo', eager = false }: ProductPhotoProps) {
  return (
    <span className={`${styles.box} ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          // Local previews (blob:) and online-database photos (https:) are shown as they are;
          // only our own stored photos ("/images/…") go through the optimiser.
          unoptimized={!src.startsWith('/')}
          style={{ objectFit: fit }}
        />
      ) : (
        <span className={styles.placeholder}>{placeholder}</span>
      )}
    </span>
  );
}
