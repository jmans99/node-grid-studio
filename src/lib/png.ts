/** Largest side Chrome, Firefox and Safari will reliably draw on a canvas. */
const MAX_SIDE = 16384;
const MAX_PIXELS = 100_000_000;

/**
 * Turn the SVG string into a PNG at `scale` times its size. Draws the same SVG
 * the preview shows, so the PNG always matches the picture.
 */
export async function svgToPng(svg: string, width: number, height: number, scale: number): Promise<Blob> {
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) {
    throw new Error(`Too large for ${scale}x (${w} × ${h} px). Try a smaller scale or canvas.`);
  }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not draw the SVG'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(image, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
