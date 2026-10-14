import { darken, readableOn } from './color';
import { escapeXml, fmt } from './format';
import { type Pt, type ShapeSpec, insetSpec, linkMarkup, nodeMarkup } from './geometry';
import { BAR_LIMIT, type JoinEnd, barMarkup } from './joins';
import { patternMarkup } from './patterns';
import { FONT_STACK, fontMetrics } from './text';
import { resolvePalette } from './settings';
import type { Palette, Scene, Style, TitleShape } from './types';

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

/** Add attributes to a single SVG element string, such as a colour that overrides its group. */
function paint(markup: string, attrs: string): string {
  return markup && attrs ? markup.replace(/\/>$/, ` ${attrs}/>`) : markup;
}

/**
 * Work out the canvas and how the scene sits on it.
 *
 * "Fit pattern": the canvas is the pattern plus one node size of edge and the margin, at scale 1.
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
  // One node radius around the node centres (or half a line, if that is wider).
  const pad = Math.max(style.nodeSize, style.lineWidth / 2);
  let boxX = Infinity;
  let boxY = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const n of scene.nodes) {
    if (n.hidden) continue;
    boxX = Math.min(boxX, n.x - pad);
    boxY = Math.min(boxY, n.y - pad);
    right = Math.max(right, n.x + pad);
    bottom = Math.max(bottom, n.y + pad);
  }
  // Title shapes can be wider than a node.
  for (const t of scene.titles) {
    boxX = Math.min(boxX, t.cx - t.halfW);
    boxY = Math.min(boxY, t.cy - t.halfH);
    right = Math.max(right, t.cx + t.halfW);
    bottom = Math.max(bottom, t.cy + t.halfH);
  }
  if (!Number.isFinite(boxX)) return empty;
  const boxW = right - boxX;
  const boxH = bottom - boxY;

  const { preset, width, height, margin } = style.canvas;
  let outW: number;
  let outH: number;
  let scale: number;
  if (preset === 'fit') {
    // A node's width of breathing room on every side, so nothing touches the edge, plus the margin.
    const edge = style.nodeSize + margin;
    outW = boxW + edge * 2;
    outH = boxH + edge * 2;
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
  const solid = new Map(scene.nodes.map((n) => [n.id, fillsShown && !patterned(n.pick)] as const));

  // Title shapes, in px. A link to a title aims at the spot where its node was,
  // kept inside the capsule, and stops at the capsule edge.
  const titleBox = new Map(
    scene.titles.map((t) => {
      const c = { x: t.cx * k + m.offsetX, y: t.cy * k + m.offsetY };
      const spec: ShapeSpec = { shape: 'capsule', half: t.halfH * k, halfW: t.halfW * k, corner: 0 };
      return [t.id, { c, spec }] as const;
    }),
  );
  const aimAt = (p: Pt, titleId: string): Pt => {
    const b = titleBox.get(titleId)!;
    const reach = Math.max(b.spec.halfW! - b.spec.half, 0);
    return {
      x: Math.max(b.c.x - reach, Math.min(b.c.x + reach, p.x)),
      y: Math.max(b.c.y - b.spec.half / 2, Math.min(b.c.y + b.spec.half / 2, p.y)),
    };
  };
  const ends = (link: (typeof scene.links)[number]) => {
    const a = at.get(link.from);
    const b = at.get(link.to);
    if (!a || !b) return null;
    return { a: link.titleFrom ? aimAt(a, link.titleFrom) : a, b: link.titleTo ? aimAt(b, link.titleTo) : b };
  };

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
    // Title shapes are solid: a line runs in under them, or stops at the edge when dashed.
    const titleStop = (titleId: string) =>
      style.dashed ? insetSpec(titleBox.get(titleId)!.spec, Math.min(lineWidth / 2, half / 2)) : undefined;
    // Dashes are measured as they look on screen. Each link fits its own pattern.
    const dash = style.dashed
      ? { dash: style.dashLength * k, gap: style.dashGap * k, cap: round ? lineWidth : 0 }
      : undefined;
    for (const link of scene.links) {
      const e = ends(link);
      if (!e) continue;
      const markup = linkMarkup(e.a, e.b, link.bend, style.linePath, style.lineRadius * k, {
        trimFrom: link.titleFrom ? titleStop(link.titleFrom) : stopAt(link.from),
        trimTo: link.titleTo ? titleStop(link.titleTo) : stopAt(link.to),
        fromCentre: link.titleFrom ? titleBox.get(link.titleFrom)!.c : undefined,
        toCentre: link.titleTo ? titleBox.get(link.titleTo)!.c : undefined,
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
    const endAt = (id: string, c: Pt, titleId?: string): JoinEnd => {
      if (titleId) return { ...titleBox.get(titleId)!, solid: true };
      const isSolid = solid.get(id) ?? true;
      return { c, solid: isSolid, spec: isSolid ? nodeSpec : innerSpec };
    };
    for (const link of scene.links) {
      const e = ends(link);
      if (!e) continue;
      const shapes = barMarkup(
        e.a,
        e.b,
        link.bend,
        style.linePath,
        style.lineRadius * k,
        endAt(link.from, e.a, link.titleFrom),
        endAt(link.to, e.b, link.titleTo),
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
    if (n.hidden) return;
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

  // ---- Title shapes: a capsule with live text, so it stays editable in Figma.
  const titleShapes = scene.titles.map((t) => titleMarkup(t, titleBox.get(t.id)!.c, k, palette));

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

/** One title shape: a capsule and its text, grouped and named after the offering. */
function titleMarkup(t: TitleShape, c: Pt, k: number, palette: Palette): string {
  const halfW = t.halfW * k;
  const halfH = t.halfH * k;
  const size = t.fontSize * k;
  const outline = t.outline
    ? ` stroke="${escapeXml(t.outline)}" stroke-width="${fmt(Math.max(0.6, t.halfH * 0.08) * k)}"`
    : '';
  const capsule = `<rect x="${fmt(c.x - halfW)}" y="${fmt(c.y - halfH)}" width="${fmt(halfW * 2)}" height="${fmt(halfH * 2)}" rx="${fmt(halfH)}" fill="${escapeXml(t.fill)}"${outline}/>`;

  const ink =
    t.textColor === 'text'
      ? palette.text
      : t.textColor === 'offering' && t.state !== 'lead'
        ? darken(t.color, 0.25)
        : readableOn(t.fill);
  const anchor = t.align === 'left' ? 'start' : t.align === 'right' ? 'end' : 'middle';
  const x = t.align === 'left' ? c.x - halfW + t.padX * k : t.align === 'right' ? c.x + halfW - t.padX * k : c.x;
  // Centre each line on its capitals: the baseline sits half a cap height below the line's middle.
  const capHalf = (fontMetrics(t.font).capHeight * size) / 2;
  const lineHeight = size * 1.25;
  const baseline = (i: number) => c.y + (i - (t.lines.length - 1) / 2) * lineHeight + capHalf;
  const attrs = `font-family="${escapeXml(FONT_STACK[t.font])}" font-size="${fmt(size)}" font-weight="${t.weight}" fill="${escapeXml(ink)}" text-anchor="${anchor}"`;
  const text =
    t.lines.length === 1
      ? `<text x="${fmt(x)}" y="${fmt(baseline(0))}" ${attrs}>${escapeXml(t.lines[0])}</text>`
      : `<text ${attrs}>${t.lines
          .map((line, i) => `<tspan x="${fmt(x)}" y="${fmt(baseline(i))}">${escapeXml(line)}</tspan>`)
          .join('')}</text>`;
  return `<g id="title-${escapeXml(t.id)}">${capsule}${text}</g>`;
}
