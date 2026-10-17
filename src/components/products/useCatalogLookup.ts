'use client';

import { useEffect, useRef, useState } from 'react';
import { Barcode } from '@/domain/Barcode';
import type { CatalogEntry } from '@/domain/CatalogEntry';
import { isRestrictedCirculation } from '@/domain/InternalBarcode';
import { useServices } from '@/components/providers/ServicesProvider';

export type CatalogLookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; entry: CatalogEntry }
  | { status: 'not-found' }
  | { status: 'unavailable' };

/**
 * Looks a barcode up in the online product database while `barcode` is set.
 * Invalid and in-store codes are never sent. `onFound` runs once per found entry
 * (e.g. to pre-fill a form).
 */
export function useCatalogLookup(barcode: string | null, onFound?: (entry: CatalogEntry) => void): CatalogLookup {
  const { api } = useServices();
  const code = barcode && Barcode.isValid(barcode) && !isRestrictedCirculation(barcode.trim()) ? barcode.trim() : null;
  // The result is stored with the code it belongs to, so a changed code shows "loading" right away.
  const [result, setResult] = useState<{ code: string; lookup: CatalogLookup } | null>(null);
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    onFoundRef.current = onFound;
  });

  useEffect(() => {
    if (!code) return;
    let current = true;
    api.lookupCatalog(code).then(
      (entry) => {
        if (!current) return;
        setResult({ code, lookup: entry ? { status: 'found', entry } : { status: 'not-found' } });
        if (entry) onFoundRef.current?.(entry);
      },
      () => current && setResult({ code, lookup: { status: 'unavailable' } }),
    );
    return () => {
      current = false;
    };
  }, [api, code]);

  if (!code) return { status: 'idle' };
  return result?.code === code ? result.lookup : { status: 'loading' };
}
