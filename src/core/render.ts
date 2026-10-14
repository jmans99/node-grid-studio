import { escapeXml, fmt } from './format';
import { linkMarkup, nodeMarkup } from './geometry';
import { resolvePalette } from './settings';
import type { Scene, Style } from './types';

export { escapeXml, fmt };

export interface Measure {
  /** Output size in px. This is the SVG width, height and viewBox. */
  width: number;
  height: number;
  /** Scene units to px. */
  scale: number;
  /** px = unit * scale + offset. */
  offsetX: number;
  offsetY: number;
  /** The pattern's own box, in px. It is centred with the margin around it. */
  pattern: { x: number; y: number; width: number; height: number };
}

/**
 * Work out the canvas and how the scene sits on it.
 *
 * "Fit pattern": the canvas is the pattern plus the margin, at scale 1.
 * Any other canvas: the pattern is scaled to fit inside the margin, and centred.
 */
export function measure(scene: Scene, style: Style): Measure {
  const empty: Measure = {
    width: 0,
    height: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    pattern: { x: 0, y: 0, width: 0, height: 0 },
  };
  if (!scene.nodes.length) return empty;

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
  // One node radius around the node centres (or half a line, if that is wider).
  const pad = Math.max(style.nodeSize, style.lineWidth / 2);
  const boxX = minX - pad;
  const boxY = minY - pad;
  const boxW = maxX - minX + pad * 2;
  const boxH = maxY - minY + pad * 2;

  const { preset, width, height, margin } = style.canvas;
  let outW: number;
  let outH: number;
  let scale: number;
  if (preset === 'fit') {
    outW = boxW + margin * 2;
    outH = boxH + margin * 2;
    scale = 1;
  } else {
    outW = width;
    outH = height;
    const availW = Math.max(outW - margin * 2, 1);
    const availH = Math.max(outH - margin * 2, 1);
    scale = Math.min(availW / boxW, availH / boxH);
  }
  const px = (outW - boxW * scale) / 2;
  const py = (outH - boxH * scale) / 2;
  return {
    width: outW,
    height: outH,
    scale,
    offsetX: px - boxX * scale,
    offsetY: py - boxY * scale,
    pattern: { x: px, y: py, width: boxW * scale, height: boxH * scale },
  };
}

/**
 * Draw a scene as an SVG string. The preview and every export use this one
 * function. Only plain shapes: no patterns, no filters. All numbers are baked
 * in at output size, so there are no transforms to trip up an import.
 */
export function render(scene: Scene, style: Style): string {
  const m = measure(scene, style);
  const { palette, transparent } = resolvePalette(style);
  const k = m.scale;
  const w = fmt(m.width);
  const h = fmt(m.height);
  const at = new Map(scene.nodes.map((n) => [n.id, { x: n.x * k + m.offsetX, y: n.y * k + m.offsetY }] as const));

  // Nodes are sized first, because links may need to stop at their edge.
  const half = style.nodeSize * k;
  const outline = style.nodeStyle === 'filled' ? 0 : Math.min(style.outlineWidth, style.nodeSize) * k;

  // Links
  const lineWidth = style.lineWidth * k;
  const round = style.lineCap === 'round';
  // Plain lines run centre to centre, hidden under filled nodes. Outline-only nodes
  // would show them inside the ring, and dashes would start under the node, so in
  // those cases each link is cut at the node edge. It stops on the middle of the ring
  // (a little further out for round caps, which stick out past the line end) or, for
  // a filled node, just inside the edge.
  const trimmed = style.nodeStyle === 'outline' || style.dashed;
  const trimHalf =
    outline > 0 ? half - outline / 2 + (round ? lineWidth / 2 : 0) : half - Math.min(lineWidth / 2, half / 2);
  const trim = trimmed
    ? {
        shape: style.nodeShape,
        half: trimHalf,
        corner: Math.max(Math.min(style.cornerRadius * k, half) - (half - trimHalf), 0),
      }
    : undefined;
  // Dashes are measured as they look on screen. Each link fits its own pattern.
  const dash = style.dashed
    ? { dash: Math.max(4 * lineWidth, 3 * k), gap: Math.max(3 * lineWidth, 2 * k), cap: round ? lineWidth : 0 }
    : undefined;
  const links: string[] = [];
  for (const link of scene.links) {
    const a = at.get(link.from);
    const b = at.get(link.to);
    if (!a || !b) continue;
    const markup = linkMarkup(a, b, link.bend, style.linePath, style.lineRadius * k, trim, dash);
    if (markup) links.push(markup);
  }
  const linkAttrs = [`fill="none"`, `stroke="${escapeXml(palette.line)}"`, `stroke-width="${fmt(lineWidth)}"`];
  linkAttrs.push(`stroke-linecap="${style.lineCap}"`);

  // Nodes
  const nodes = scene.nodes.map((n) => {
    const p = at.get(n.id)!;
    return nodeMarkup({
      shape: style.nodeShape,
      cx: p.x,
      cy: p.y,
      half,
      corner: style.cornerRadius * k,
      outline,
    });
  });
  const nodeAttrs =
    style.nodeStyle === 'filled'
      ? [`fill="${escapeXml(palette.node)}"`]
      : style.nodeStyle === 'outline'
        ? [`fill="none"`, `stroke="${escapeXml(palette.node)}"`, `stroke-width="${fmt(outline)}"`]
        : [`fill="${escapeXml(palette.node)}"`, `stroke="${escapeXml(palette.outline)}"`, `stroke-width="${fmt(outline)}"`];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    ...(transparent ? [] : [`<rect id="background" width="${w}" height="${h}" fill="${escapeXml(palette.background)}"/>`]),
    `<g id="links" ${linkAttrs.join(' ')}>`,
    ...links,
    `</g>`,
    `<g id="nodes" ${nodeAttrs.join(' ')}>`,
    ...nodes,
    `</g>`,
    `</svg>`,
  ].join('\n');
}
