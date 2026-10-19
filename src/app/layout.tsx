import type { Metadata, Viewport } from 'next';
import { Nav } from '@/components/Nav';
import { AppProviders } from '@/components/providers/AppProviders';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Price Scanner', template: '%s · Price Scanner' },
  description: 'Scan product barcodes to see prices and add up a cart.',
  // iPhone "Add to Home Screen": full-screen app with its own icon and name.
  appleWebApp: { capable: true, title: 'Scanner', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-icon-180.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Use the whole screen on phones with a notch; the CSS keeps content clear of it (safe-area insets).
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#111317' },
  ],
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
