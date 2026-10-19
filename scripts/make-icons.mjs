// Renders the app icons (Add to Home Screen) from public/icons/icon.svg.
//   npm run icons
import sharp from 'sharp';

const svg = 'public/icons/icon.svg';
const out = [
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/icon-512.png', 512, 0],
  // "maskable": Android may crop to a circle/squircle, so keep the drawing inside the middle 80%.
  ['public/icons/icon-maskable-512.png', 512, 0.1],
  ['public/icons/apple-icon-180.png', 180, 0],
];

for (const [file, size, padding] of out) {
  const inner = Math.round(size * (1 - 2 * padding));
  const image = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#2563eb' } })
    .composite([{ input: image, gravity: 'center' }])
    .png()
    .toFile(file);
  console.log('wrote', file);
}
