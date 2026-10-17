import type { CatalogLookup } from './useCatalogLookup';
import styles from './CatalogHint.module.css';

interface Props {
  lookup: CatalogLookup;
  currentName: string;
  onUseName: (name: string) => void;
}

/** Tells the user what the online product database said about the barcode, with attribution. */
export function CatalogHint({ lookup, currentName, onUseName }: Props) {
  switch (lookup.status) {
    case 'idle':
      return null;
    case 'loading':
      return <p className={styles.hint}>Looking this barcode up online…</p>;
    case 'not-found':
      return <p className={styles.hint}>Not in the online product database. Please type the name.</p>;
    case 'unavailable':
      return <p className={styles.hint}>The online product database is not available right now. Please type the name.</p>;
    case 'found': {
      const { entry } = lookup;
      return (
        <div className={styles.found} role="status">
          <span>
            ✓ Filled in from{' '}
            <a href={entry.source.url} target="_blank" rel="noopener noreferrer">
              {entry.source.name}
            </a>
            . Please check the name and photo, then enter your price.
          </span>
          {currentName.trim() !== entry.name && (
            <button type="button" className="link-button" onClick={() => onUseName(entry.name)}>
              Use “{entry.name}”
            </button>
          )}
        </div>
      );
    }
  }
}
