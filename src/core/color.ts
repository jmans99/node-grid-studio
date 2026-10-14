/** Small hex colour helpers. */

/** Accepts "#abc", "abc", "#aabbcc" or "aabbcc". Returns "#AABBCC", or null if it is not a colour. */
export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toUpperCase()}`;
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Blend colour a towards colour b. t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export const lighten = (hex: string, t: number) => mix(hex, '#FFFFFF', t);
export const darken = (hex: string, t: number) => mix(hex, '#000000', t);
