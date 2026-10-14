import manropeUrl from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url';
import openSansUrl from '@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2?url';

/**
 * The title fonts. The SVG names them "Manrope" and "Open Sans" (the names
 * Figma knows), so the page registers the bundled files under those names.
 */
const FILES = [
  { family: 'Manrope', url: manropeUrl, weights: '200 800' },
  { family: 'Open Sans', url: openSansUrl, weights: '300 800' },
];

const face = (family: string, src: string, weights: string) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weights};font-display:swap;src:url(${src}) format('woff2');}`;

/** Make the fonts available to the live preview. */
export function installFonts(): void {
  const style = document.createElement('style');
  style.textContent = FILES.map((f) => face(f.family, f.url, f.weights)).join('\n');
  document.head.appendChild(style);
}

let embedded: Promise<string> | null = null;

/** @font-face rules with the font files inlined, for SVGs drawn as images (PNG export). */
function embeddedCss(): Promise<string> {
  embedded ??= Promise.all(
    FILES.map(async (f) => {
      const bytes = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return face(f.family, `data:font/woff2;base64,${btoa(binary)}`, f.weights);
    }),
  ).then((rules) => rules.join(''));
  return embedded;
}

/**
 * Put the fonts inside the SVG so its text draws correctly as an image. Only
 * used for PNG export: the SVG export keeps plain, editable text.
 */
export async function withEmbeddedFonts(svg: string): Promise<string> {
  if (!svg.includes('<text')) return svg;
  const css = await embeddedCss();
  return svg.replace(/^(<svg[^>]*>)/, `$1<defs><style>${css}</style></defs>`);
}
