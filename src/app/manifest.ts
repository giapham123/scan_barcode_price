import type { MetadataRoute } from 'next';

/**
 * Lets phones install the app ("Add to Home Screen"): it then opens full-screen
 * with its own icon, like a native app. Icons: public/icons (npm run icons).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Price Scanner',
    short_name: 'Scanner',
    description: 'Scan product barcodes to see prices and add up a cart.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f5f7',
    theme_color: '#2563eb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
