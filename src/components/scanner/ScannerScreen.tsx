'use client';

import { useCallback, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import { cartReducer, EMPTY_CART, summarizeCart } from '@/domain/Cart';
import { useAppEvent, useServices } from '@/components/providers/ServicesProvider';
import { useProductEditor } from '@/components/products/ProductEditorProvider';
import type { EditRequest } from '@/components/products/ProductEditorDialog';
import { config } from '@/lib/config';
import { CameraPanel } from './CameraPanel';
import { CartPanel } from './CartPanel';
import { ResultCard, type ResultState } from './ResultCard';
import { ScanHistory, type HistoryEntry } from './ScanHistory';
import { useKeyboardScanner } from './useKeyboardScanner';
import styles from './Scanner.module.css';

/**
 * The Scanner page: wires the input sources (camera, handheld scanner, form)
 * to the lookup service, and lookup / product events to the cart and the UI.
 * Panels below are presentational; all state lives here.
 */
export function ScannerScreen() {
  const { lookupService } = useServices();
  const editProduct = useProductEditor();

  const [cart, dispatch] = useReducer(cartReducer, EMPTY_CART);
  const summary = useMemo(() => summarizeCart(cart), [cart]);
  const [result, setResult] = useState<ResultState>({ status: 'idle' });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [flash, setFlash] = useState<{ barcode: string; seq: number } | null>(null);
  const [code, setCode] = useState('');
  const seq = useRef(0);
  const paused = useRef(false); // scans are ignored while the editor is open

  const lookup = useCallback(
    (raw: string) => {
      if (!paused.current) void lookupService.lookup(raw);
    },
    [lookupService],
  );
  useKeyboardScanner(lookup);

  // ---- events from the services (Observer) ----
  useAppEvent('lookup:started', ({ code }) => setResult({ status: 'loading', code }));

  useAppEvent('lookup:completed', (r) => {
    const id = ++seq.current;
    setResult(r);
    setHistory((h) => [{ id, at: new Date(), result: r }, ...h].slice(0, config.historySize));
    if (r.status === 'found') {
      dispatch({ type: 'add', product: r.product });
      setFlash({ barcode: r.product.barcode, seq: id });
      navigator.vibrate?.(60); // short buzz on phones so you know the scan counted
    }
  });

  useAppEvent('product:saved', (product) => {
    dispatch({ type: 'updateProduct', product }); // a new price applies to items already in the cart
    setResult((r) => (r.status === 'found' && r.code === product.barcode ? { ...r, product } : r));
  });

  // ---- user actions ----
  async function edit(request: EditRequest) {
    paused.current = true;
    let saved;
    try {
      saved = await editProduct(request);
    } finally {
      paused.current = false;
    }
    // A newly added product is looked up like a fresh scan, so it lands in the cart.
    if (saved && !request.product) await lookupService.lookup(saved.barcode);
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    if (code.trim()) lookup(code);
  }

  return (
    <main className="layout">
      <CameraPanel onCode={lookup} />

      <section className="card">
        <form className={styles.manual} onSubmit={submitCode} autoComplete="off">
          <label htmlFor="manual-code">Barcode</label>
          <div className={styles.manualRow}>
            <input
              id="manual-code"
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              placeholder="e.g. 5449000000996"
            />
            <button type="submit" className="button">
              Look up
            </button>
          </div>
          <button type="button" className={`link-button ${styles.noBarcode}`} onClick={() => void edit({ createBarcode: true })}>
            Product has no barcode? Create one
          </button>
        </form>

        <ResultCard
          result={result}
          onEdit={(r) => void edit(r.status === 'found' ? { product: r.product } : { barcode: r.code })}
        />
      </section>

      <CartPanel
        summary={summary}
        flash={flash}
        onIncrement={(barcode) => dispatch({ type: 'increment', barcode })}
        onDecrement={(barcode) => dispatch({ type: 'decrement', barcode })}
        onRemove={(barcode) => dispatch({ type: 'remove', barcode })}
        onClear={() => confirm('Remove all items from the cart?') && dispatch({ type: 'clear' })}
      />

      <ScanHistory entries={history} />
    </main>
  );
}
