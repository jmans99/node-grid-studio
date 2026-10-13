import type { Scene, Style } from './types';

export interface Measure {
  width: number;
  height: number;
  /** Add this to scene x and y to get SVG coordinates. */
  offsetX: number;
  offsetY: number;
}

/** Round to 2 decimals and drop trailing zeros, so the SVG stays short and tidy. */
export function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The viewBox size: a tight box around the nodes, plus one node radius on every side. */
export function measure(scene: Scene, style: Style): Measure {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of scene.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  if (!scene.nodes.length) return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  const pad = style.nodeSize;
  return {
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    offsetX: pad - minX,
    offsetY: pad - minY,
  };
}

/**
 * Draw a scene as an SVG string. The preview and every export use this one
 * function. Only plain shapes: no patterns, no filters.
 */
export function render(scene: Scene, style: Style): string {
  const m = measure(scene, style);
  const w = fmt(m.width);
  const h = fmt(m.height);
  const at = new Map(scene.nodes.map((n) => [n.id, n] as const));

  const lines: string[] = [];
  for (const link of scene.links) {
    const a = at.get(link.from);
    const b = at.get(link.to);
    if (!a || !b) continue;
    lines.push(
      `<line x1="${fmt(a.x + m.offsetX)}" y1="${fmt(a.y + m.offsetY)}" x2="${fmt(b.x + m.offsetX)}" y2="${fmt(b.y + m.offsetY)}"/>`,
    );
  }

  const circles = scene.nodes.map(
    (n) => `<circle cx="${fmt(n.x + m.offsetX)}" cy="${fmt(n.y + m.offsetY)}" r="${fmt(style.nodeSize)}"/>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect id="background" width="${w}" height="${h}" fill="${escapeXml(style.backgroundColor)}"/>`,
    `<g id="links" fill="none" stroke="${escapeXml(style.lineColor)}" stroke-width="${fmt(style.lineWidth)}">`,
    ...lines,
    `</g>`,
    `<g id="nodes" fill="${escapeXml(style.nodeColor)}">`,
    ...circles,
    `</g>`,
    `</svg>`,
  ].join('\n');
}
