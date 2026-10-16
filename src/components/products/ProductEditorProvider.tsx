'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { Product } from '@/domain/Product';
import { useAppEvent } from '@/components/providers/ServicesProvider';
import { LabelDialog } from './LabelDialog';
import { ProductEditorDialog, type EditRequest } from './ProductEditorDialog';

type EditProduct = (request: EditRequest) => Promise<Product | null>;

const EditorContext = createContext<EditProduct | null>(null);

/**
 * Hosts the add/edit dialog and the "Barcode created" label dialog for the whole app.
 *
 *   const editProduct = useProductEditor();
 *   const saved = await editProduct({ product });   // Product, or null if cancelled
 */
export function ProductEditorProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<{ id: number; request: EditRequest; resolve: (p: Product | null) => void } | null>(null);
  const [labelFor, setLabelFor] = useState<Product | null>(null);

  // A product just got a new in-store barcode: show its label to print.
  useAppEvent('product:barcode-created', setLabelFor);

  const editProduct = useCallback<EditProduct>(
    (request) => new Promise((resolve) => setOpen({ id: Date.now(), request, resolve })),
    [],
  );

  const close = (saved: Product | null) => {
    open?.resolve(saved);
    setOpen(null);
  };

  return (
    <EditorContext.Provider value={editProduct}>
      {children}
      {open && <ProductEditorDialog key={open.id} request={open.request} onClose={close} />}
      {labelFor && <LabelDialog product={labelFor} onClose={() => setLabelFor(null)} />}
    </EditorContext.Provider>
  );
}

export function useProductEditor(): EditProduct {
  const editProduct = useContext(EditorContext);
  if (!editProduct) throw new Error('useProductEditor() must be used inside <ProductEditorProvider>');
  return editProduct;
}
