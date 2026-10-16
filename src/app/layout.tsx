import type { Metadata, Viewport } from 'next';
import { Nav } from '@/components/Nav';
import { AppProviders } from '@/components/providers/AppProviders';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Price Scanner', template: '%s · Price Scanner' },
  description: 'Scan product barcodes to see prices and add up a cart.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <Nav />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
