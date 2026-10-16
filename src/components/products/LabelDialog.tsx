'use client';

import type { Product } from '@/domain/Product';
import { ProductTag } from '@/components/barcodes/ProductTag';
import { labelPrintUrl } from '@/lib/format';
import { useModalDialog } from './useModalDialog';

/**
 * Shown after a product got a new in-store barcode: its label with a
 * "Print label" button, so it can be stuck on the item right away.
 */
export function LabelDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const dialogRef = useModalDialog(onClose);

  return (
    <dialog ref={dialogRef} className="dialog" aria-label="Barcode created">
      <div className="dialog__body">
        <h2 className="dialog__title">Barcode created</h2>
        <p className="muted">Print this label and stick it on the product. Scanning it will show the price.</p>
        <ProductTag product={product.toJSON()} />
        <div className="dialog__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Done
          </button>
          <a className="button" href={labelPrintUrl(product.barcode)} target="_blank" rel="noopener" data-autofocus>
            Print label
          </a>
        </div>
      </div>
    </dialog>
  );
}
