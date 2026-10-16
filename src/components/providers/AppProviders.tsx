'use client';

import { ProductEditorProvider } from '@/components/products/ProductEditorProvider';
import { ServicesProvider } from './ServicesProvider';

/** Everything client components need from above: services, then the product editor. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ServicesProvider>
      <ProductEditorProvider>{children}</ProductEditorProvider>
    </ServicesProvider>
  );
}
