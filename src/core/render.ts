import { lighten } from './color';
import { escapeXml, fmt } from './format';
import { type ShapeSpec, insetSpec, linkMarkup, nodeMarkup } from './geometry';
import { BAR_LIMIT, type JoinEnd, barMarkup } from './joins';
import { patternMarkup } from './patterns';
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

/** Placeholder title shape: a pill over its node, reaching most of the way to the next node. In units. */
export function titleSize(scene: Scene, style: Style): { halfW: number; halfH: number } {
  return { halfW: style.nodeSize + scene.gapX * 0.4, halfH: style.nodeSize };
}

/** Add attributes to a single SVG element string, such as a colour that overrides its group. */
function paint(markup: string, attrs: string): string {
  return markup && attrs ? markup.replace(/\/>$/, ` ${attrs}/>`) : markup;
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
  let boxX = minX - pad;
  let boxY = minY - pad;
  let right = maxX + pad;
  let bottom = maxY + pad;
  // Title shapes can be wider than a node.
  for (const t of scene.titles) {
    const { halfW, halfH } = titleSize(scene, style);
    boxX = Math.min(boxX, t.x - halfW);
    boxY = Math.min(boxY, t.y - halfH);
    right = Math.max(right, t.x + halfW);
    bottom = Math.max(bottom, t.y + halfH);
  }
  const boxW = right - boxX;
  const boxH = bottom - boxY;

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

  // ---- Nodes: sized first, because links need to know where node edges are.
  const half = style.nodeSize * k;
  const ringed = style.nodeStyle !== 'filled';
  const outline = ringed ? Math.min(style.outlineWidth, style.nodeSize) * k : 0;
  const nodeSpec: ShapeSpec = {
    shape: style.nodeShape,
    half,
    corner: style.nodeShape === 'rounded' ? Math.min(style.cornerRadius * k, half) : 0,
  };
  // The middle of the ring when there is one, otherwise the node edge.
  const innerSpec = insetSpec(nodeSpec, outline / 2);

  // A node is solid unless it has no fill (outline style) or it was given the pattern.
  const fillsShown = style.nodeStyle !== 'outline';
  const patterned = (pick: number) => fillsShown && style.fillPattern !== 'solid' && pick * 100 < style.patternMix;
  // Title shapes replace their node. They are drawn on top, so links treat them as solid.
  const titleNodes = new Set(scene.titles.map((t) => t.nodeId));
  const solid = new Map(
    scene.nodes.map((n) => [n.id, titleNodes.has(n.id) || (fillsShown && !patterned(n.pick))] as const),
  );

  // ---- Links
  const links: string[] = [];
  const feet: string[] = [];
  let linkAttrs: string[];
  if (style.joinStyle === 'plain') {
    const lineWidth = style.lineWidth * k;
    const round = style.lineCap === 'round';
    // A solid node hides a line that runs to its centre. Anything else would show
    // the line inside, so the line stops at the ring's middle or the node edge
    // (pulled out by half the width for round caps, which stick out past the end).
    // Dashes stop just inside a solid node, so they start where the node ends.
    const hollowStop = insetSpec(innerSpec, round ? -lineWidth / 2 : 0);
    const solidStop = insetSpec(nodeSpec, Math.min(lineWidth / 2, half / 2));
    const stopAt = (id: string) => (solid.get(id) ? (style.dashed ? solidStop : undefined) : hollowStop);
    // Dashes are measured as they look on screen. Each link fits its own pattern.
    const dash = style.dashed
      ? { dash: style.dashLength * k, gap: style.dashGap * k, cap: round ? lineWidth : 0 }
      : undefined;
    for (const link of scene.links) {
      const a = at.get(link.from);
      const b = at.get(link.to);
      if (!a || !b) continue;
      const markup = linkMarkup(a, b, link.bend, style.linePath, style.lineRadius * k, {
        trimFrom: stopAt(link.from),
        trimTo: stopAt(link.to),
        dash,
      });
      if (markup) links.push(paint(markup, link.color ? `stroke="${escapeXml(link.color)}"` : ''));
    }
    linkAttrs = [
      `fill="none"`,
      `stroke="${escapeXml(palette.line)}"`,
      `stroke-width="${fmt(lineWidth)}"`,
      `stroke-linecap="${style.lineCap}"`,
    ];
  } else {
    // Merged and smooth: links become bars in the node colour.
    const halfWidth = Math.min((style.barWidth * k) / 2, innerSpec.half * BAR_LIMIT[style.nodeShape]);
    const fillet = style.joinStyle === 'smooth' ? style.smoothness * style.nodeSize * 1.5 * k : 0;
    const endAt = (id: string, c: { x: number; y: number }): JoinEnd => {
      const isSolid = solid.get(id) ?? true;
      return { c, solid: isSolid, spec: isSolid ? nodeSpec : innerSpec };
    };
    for (const link of scene.links) {
      const a = at.get(link.from);
      const b = at.get(link.to);
      if (!a || !b) continue;
      const shapes = barMarkup(
        a,
        b,
        link.bend,
        style.linePath,
        style.lineRadius * k,
        endAt(link.from, a),
        endAt(link.to, b),
        halfWidth,
        fillet,
      );
      if (!shapes) continue;
      const color = link.color ? escapeXml(link.color) : '';
      links.push(paint(shapes.bar, color && `stroke="${color}"`));
      feet.push(...shapes.feet.map((f) => paint(f, color && `fill="${color}"`)));
    }
    linkAttrs = [`fill="none"`, `stroke="${escapeXml(palette.node)}"`, `stroke-width="${fmt(halfWidth * 2)}"`];
  }

  // ---- Nodes, their patterns and outlines
  const solidNodes: string[] = [];
  const rings: string[] = [];
  const clips: string[] = [];
  const patterns: string[] = [];
  scene.nodes.forEach((n, i) => {
    if (titleNodes.has(n.id)) return;
    const c = at.get(n.id)!;
    // Near a title shape, a node takes the offering colour.
    const color = n.color ? escapeXml(n.color) : '';
    const shape = nodeMarkup({ shape: style.nodeShape, cx: c.x, cy: c.y, half, corner: style.cornerRadius * k, outline });
    if (solid.get(n.id)) {
      solidNodes.push(paint(shape, color && `fill="${color}"`));
      return;
    }
    if (ringed) rings.push(paint(shape, color && style.nodeStyle === 'outline' ? `stroke="${color}"` : ''));
    if (!patterned(n.pick)) return;
    const p = patternMarkup({
      pattern: style.fillPattern,
      spec: innerSpec,
      c,
      scale: k,
      density: style.patternDensity,
      size: style.patternSize,
      angle: style.patternAngle,
      seed: n.seed,
      clipId: `ngs-clip-${i}`,
      ringed,
      color: n.color ?? palette.node,
    });
    if (p.defs) clips.push(p.defs);
    if (p.body) patterns.push(color ? `<g stroke="${color}">${p.body}</g>` : p.body);
  });

  // ---- Title shapes (placeholder: a pill over the node, no text yet)
  const { halfW, halfH } = titleSize(scene, style);
  const titleShapes = scene.titles.map((t) => {
    const c = at.get(t.nodeId)!;
    const box = `x="${fmt(c.x - halfW * k)}" y="${fmt(c.y - halfH * k)}" width="${fmt(halfW * 2 * k)}" height="${fmt(halfH * 2 * k)}" rx="${fmt(halfH * k)}"`;
    const color = escapeXml(t.color);
    // Lead: solid colour. Included: a light tint, edged in the colour.
    return t.state === 'lead'
      ? `<rect ${box} fill="${color}"/>`
      : `<rect ${box} fill="${lighten(t.color, 0.8)}" stroke="${color}" stroke-width="${fmt(Math.max(0.6, style.nodeSize * 0.15) * k)}"/>`;
  });

  const ringColor = style.nodeStyle === 'outline' ? palette.node : palette.outline;
  const solidAttrs =
    style.nodeStyle === 'both'
      ? `fill="${escapeXml(palette.node)}" stroke="${escapeXml(palette.outline)}" stroke-width="${fmt(outline)}"`
      : `fill="${escapeXml(palette.node)}"`;
  const group = (id: string, attrs: string, items: string[]) =>
    items.length ? [`<g id="${id}"${attrs ? ` ${attrs}` : ''}>`, ...items, `</g>`] : [];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    ...(clips.length ? [`<defs>`, ...clips, `</defs>`] : []),
    ...(transparent ? [] : [`<rect id="background" width="${w}" height="${h}" fill="${escapeXml(palette.background)}"/>`]),
    ...group('links', linkAttrs.join(' '), links),
    ...group('joins', `fill="${escapeXml(palette.node)}"`, feet),
    ...group('nodes', solidAttrs, solidNodes),
    ...group(
      'node-patterns',
      `fill="none" stroke="${escapeXml(palette.node)}" stroke-width="${fmt(style.patternSize * k)}"`,
      patterns,
    ),
    ...group('node-outlines', `fill="none" stroke="${escapeXml(ringColor)}" stroke-width="${fmt(outline)}"`, rings),
    ...group('titles', '', titleShapes),
    `</svg>`,
  ].join('\n');
}
