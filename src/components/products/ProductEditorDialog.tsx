'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Barcode, InvalidBarcodeError } from '@/domain/Barcode';
import type { Product } from '@/domain/Product';
import { useServices } from '@/components/providers/ServicesProvider';
import { AuthCancelledError } from '@/lib/client/api/ProductApiClient';
import { resizeImage } from '@/lib/client/imageResize';
import { PhotoUploadError, type PhotoChange, type ProductDraft } from '@/lib/client/services/ProductEditService';
import { config } from '@/lib/config';
import { formatDateTime, formatPrice, labelPrintUrl } from '@/lib/format';
import { CatalogHint } from './CatalogHint';
import { ProductPhoto } from './ProductPhoto';
import { useCatalogLookup } from './useCatalogLookup';
import { useModalDialog } from './useModalDialog';
import styles from './ProductEditorDialog.module.css';

export interface EditRequest {
  /** Existing product to edit; omit to add a new one. */
  product?: Product | null;
  /** Known barcode of a new product (e.g. scanned but not found). Locked in the form. */
  barcode?: string;
  /** Start in "the product has no barcode – create one" mode. */
  createBarcode?: boolean;
}

interface Props {
  request: EditRequest;
  onClose: (saved: Product | null) => void;
}

/** Dialog for adding a product or changing its price / photo. */
export function ProductEditorDialog({ request, onClose }: Props) {
  const { editService } = useServices();
  const existing = request.product ?? null;
  const lockedBarcode = existing?.barcode ?? request.barcode ?? '';
  const canCreateBarcode = !lockedBarcode; // only when adding a product with no known barcode

  const [createBarcode, setCreateBarcode] = useState(Boolean(request.createBarcode) && canCreateBarcode);
  const [barcode, setBarcode] = useState(lockedBarcode);
  const [name, setName] = useState(existing?.name ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [currency, setCurrency] = useState(existing?.currency ?? config.currency);
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [preview, setPreview] = useState<string | null>(existing?.imageUrl ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // New product with a real barcode: ask the online database and pre-fill what is still empty.
  const catalog = useCatalogLookup(!existing && !createBarcode ? barcode : null, (entry) => {
    setName((current) => current || entry.name);
    if (entry.imageUrl) {
      const url = entry.imageUrl;
      setPhoto((current) => (current.kind === 'keep' ? { kind: 'import', url } : current));
      setPreview((current) => current ?? url);
    }
  });

  const dialogRef = useModalDialog(() => {
    if (!saving) onClose(null);
  });

  // Free the memory of a local photo preview when it is replaced or the dialog closes.
  useEffect(() => {
    if (!preview?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setError('');
      const image = await resizeImage(file);
      setPhoto({ kind: 'replace', image });
      setPreview(URL.createObjectURL(image));
    } catch {
      setError('Could not read that photo. Try another one.');
    }
  }

  function removePhoto() {
    setPhoto({ kind: 'remove' });
    setPreview(null);
  }

  /** @returns the draft, or an error message to show */
  function readForm(): ProductDraft | string {
    let code: string | null = null; // null = create a new in-store barcode
    if (!createBarcode) {
      try {
        code = Barcode.parse(barcode).value;
      } catch (err) {
        if (!(err instanceof InvalidBarcodeError)) throw err;
        return barcode.trim() ? `Barcode: ${err.reason}.` : 'Scan or type the barcode, or tap "No barcode? Create one".';
      }
    }

    if (!name.trim()) return 'Please enter the product name.';

    const priceText = price.trim().replace(',', '.'); // phones in many countries type a comma
    const value = Number(priceText);
    if (priceText === '' || !Number.isFinite(value) || value < 0) return 'Please enter a valid price, e.g. 1.25';

    const code3 = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code3)) return 'Currency must be a 3-letter code, e.g. USD or VND.';

    return { barcode: code, name: name.trim(), price: value, currency: code3, unit: unit.trim() };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const draft = readForm();
    if (typeof draft === 'string') return setError(draft);

    setSaving(true);
    try {
      onClose(await editService.save(draft, photo));
    } catch (err) {
      if (err instanceof PhotoUploadError) {
        // The product exists now; saving again would create a duplicate.
        onClose(err.product);
        setTimeout(() => alert(`${err.message}\nOpen the product again to add the photo.`));
        return;
      }
      setError(err instanceof AuthCancelledError ? 'Admin PIN is required to save.' : `Could not save: ${(err as Error).message}`);
      setSaving(false);
    }
  }

  const title = existing ? 'Edit product' : createBarcode ? 'New product without barcode' : 'Add product';

  return (
    <dialog ref={dialogRef} className="dialog" aria-label={title}>
      <form className="dialog__body" onSubmit={submit} noValidate>
        <h2 className="dialog__title">{title}</h2>

        <ProductPhoto
          src={preview}
          alt="Product photo"
          sizes="440px"
          fit="contain"
          className={styles.photo}
          placeholder="No photo yet"
          eager
        />
        <div className={styles.row}>
          <label className="button button--ghost">
            Take / choose photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickPhoto(e.target.files?.[0]);
                e.target.value = ''; // allow picking the same file again
              }}
            />
          </label>
          {preview && (
            <button type="button" className="button button--ghost" onClick={removePhoto}>
              Remove photo
            </button>
          )}
        </div>

        <div className={styles.barcode}>
          <label className="field">
            Barcode
            <input
              value={createBarcode ? '' : barcode}
              onChange={(e) => setBarcode(e.target.value)}
              readOnly={createBarcode || !canCreateBarcode}
              placeholder={createBarcode ? 'Created automatically when you save' : 'Scan or type the barcode'}
              inputMode="numeric"
              autoComplete="off"
              data-autofocus={(!lockedBarcode && !createBarcode) || undefined}
            />
          </label>
          {canCreateBarcode && (
            <button type="button" className="button button--ghost" onClick={() => setCreateBarcode((on) => !on)}>
              {createBarcode ? 'The product has a barcode' : 'No barcode? Create one'}
            </button>
          )}
          {createBarcode && (
            <p className={`muted ${styles.hint}`}>
              A new in-store barcode (starting with 20) is created when you save. Then you can print the label and
              stick it on the product.
            </p>
          )}
          <CatalogHint lookup={catalog} currentName={name} onUseName={setName} />
        </div>

        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoComplete="off"
            data-autofocus={(!existing && (Boolean(lockedBarcode) || createBarcode)) || undefined}
          />
        </label>
        <div className={styles.priceRow}>
          <label className="field">
            Price
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              data-autofocus={Boolean(existing) || undefined}
            />
          </label>
          <label className="field">
            Currency
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              autoComplete="off"
            />
          </label>
        </div>
        {existing && (
          <p className={`muted ${styles.hint}`}>
            Current price: {formatPrice(existing.price, existing.currency)}
            {existing.updatedAt && ` · last changed ${formatDateTime(existing.updatedAt)}`}
          </p>
        )}
        <label className="field">
          Unit
          <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} placeholder="can, kg, pack…" autoComplete="off" />
        </label>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className="dialog__actions">
          {existing && (
            <a className={`button button--ghost ${styles.print}`} href={labelPrintUrl(existing.barcode)} target="_blank" rel="noopener">
              Print label
            </a>
          )}
          <button type="button" className="button button--ghost" onClick={() => onClose(null)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
