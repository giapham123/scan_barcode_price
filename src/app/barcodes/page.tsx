import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BarcodeSheet } from '@/components/barcodes/BarcodeSheet';
import { getServices } from '@/lib/server/container';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Test barcodes' };

/**
 * Printable sheet of every product's barcode.
 *   /barcodes                         all products
 *   /barcodes?barcodes=a,b&print=1    only those labels, then open the print dialog ("Print label")
 */
export default function BarcodesPage({ searchParams }: PageProps<'/barcodes'>) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        <Sheet searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Sheet({ searchParams }: Pick<PageProps<'/barcodes'>, 'searchParams'>) {
  const params = await searchParams;
  const only = typeof params.barcodes === 'string' ? params.barcodes.split(',').filter(Boolean) : null;
  const products = (await getServices().store.list()).filter((p) => !only || only.includes(p.barcode));

  return <BarcodeSheet products={products.map((p) => p.toJSON())} labelsOnly={only !== null} autoPrint={params.print === '1'} />;
}
