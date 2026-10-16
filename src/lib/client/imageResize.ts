/**
 * Phone photos are often 3-12 MB. Shrink them in the browser before upload
 * so saving is fast on mobile data and the server stores small files.
 *
 * @returns a JPEG no larger than `maxSize` pixels on its longest side
 */
export async function resizeImage(file: Blob, { maxSize = 1024, quality = 0.82 } = {}): Promise<Blob> {
  // createImageBitmap applies the photo's EXIF rotation, so portrait shots stay upright.
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background in JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo'))), 'image/jpeg', quality),
    );
  } finally {
    bitmap.close();
  }
}
