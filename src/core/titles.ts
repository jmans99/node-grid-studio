import { BRAND } from '../brand';
import { darken, lighten } from './color';
import type { ResolvedOffering } from './offerings';
import { hashInts, randomAt } from './random';
import { measureText, wrapTwoLines } from './text';
import type { SceneLink, SceneNode, TitleFit, TitleSettings, TitleShape } from './types';

/** Largest grid the sliders allow. */
export const MAX_COLUMNS = 25;
export const MAX_ROWS = 20;

/** A whole number from a string, for seeding things by id. */
export function hashString(text: string): number {
  return hashInts(...Array.from(text, (ch) => ch.charCodeAt(0)));
}

export interface TitleContext {
  /** Node radius in units. */
  nodeSize: number;
  gapX: number;
  gapY: number;
}

/** Space kept between a title shape and the nearest node edge, in units. */
export const clearance = (ctx: TitleContext) => Math.max(1, 0.15 * Math.min(ctx.gapX, ctx.gapY));

/** A title before it is placed: its text, size, and how many grid cells it needs. */
export interface TitleRequest {
  offering: ResolvedOffering;
  lines: string[];
  fontSize: number;
  padX: number;
  halfW: number;
  halfH: number;
  cols: number;
  rows: number;
}

/**
 * Size each active offering's title shape.
 *
 * The capsule is as tall as its text (and at least as tall as a node) and as
 * wide as its text plus padding. With "remove", it takes a block of whole grid
 * cells: enough columns for its width, and two rows when wrapped. The capsule
 * may reach past the outer nodes of its block, but stops clear of the next node.
 * With "push apart" it takes the place of a single node and the grid opens
 * around it.
 */
export function titleRequests(offerings: ResolvedOffering[], t: TitleSettings, ctx: TitleContext): TitleRequest[] {
  const m = clearance(ctx);
  return offerings
    .filter((o) => o.state !== 'off')
    .map((o) => {
      const text = t.names === 'short' ? o.short : o.name;
      const fontSize = t.size * (o.state === 'lead' ? t.leadScale : 1);
      const lines = t.wrap && text.length > t.wrapAfter ? wrapTwoLines(text, t.font, t.weight, fontSize) : [text];
      const textW = Math.max(...lines.map((l) => measureText(l, t.font, t.weight, fontSize)));
      const height = Math.max(lines.length * fontSize * 1.25 + t.padding * 2, ctx.nodeSize * 2);
      const halfH = height / 2;
      // Extra side room so text clears the rounded ends.
      const padX = t.padding + halfH * 0.5;
      const halfW = Math.max(textW / 2 + padX, halfH);
      let cols = 1;
      let rows = 1;
      if (t.makeRoom === 'remove') {
        const reachX = ctx.gapX - ctx.nodeSize - m;
        const reachY = ctx.gapY - ctx.nodeSize - m;
        cols = Math.max(1, Math.ceil((halfW * 2 - reachX * 2) / ctx.gapX + 1 - 1e-9));
        rows = Math.max(lines.length, Math.ceil((halfH * 2 - reachY * 2) / ctx.gapY + 1 - 1e-9));
      }
      return { offering: o, lines, fontSize, padX, halfW, halfH, cols, rows };
    });
}

export interface Placement {
  col: number;
  row: number;
}

/**
 * Seeded target points spread over the grid, one per title: each is the best
 * of a few random tries, as far as possible from the ones before. With
 * `keepCategories`, each category gets one target and its offerings gather
 * around it.
 */
function targets(reqs: TitleRequest[], columns: number, rows: number, seed: number, keepCategories: boolean) {
  const chosen: { x: number; y: number }[] = [];
  const spreadPoint = (key: number) => {
    let best = { x: 0, y: 0 };
    let bestScore = -1;
    for (let k = 0; k < 12; k++) {
      const p = { x: randomAt(seed, 41, key, k) * (columns - 1), y: randomAt(seed, 42, key, k) * (rows - 1) };
      const score = chosen.length
        ? Math.min(...chosen.map((q) => Math.hypot((p.x - q.x) / columns, (p.y - q.y) / rows)))
        : 1;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    chosen.push(best);
    return best;
  };
  const out = new Map<string, { x: number; y: number }>();
  const byCategory = new Map<string, { x: number; y: number }>();
  for (const r of reqs) {
    const key = hashString(r.offering.id);
    if (!keepCategories) {
      out.set(r.offering.id, spreadPoint(key));
      continue;
    }
    const catId = r.offering.categoryId;
    if (!byCategory.has(catId)) byCategory.set(catId, spreadPoint(hashString(catId)));
    const c = byCategory.get(catId)!;
    out.set(r.offering.id, {
      x: c.x + (randomAt(seed, 43, key) - 0.5) * 3,
      y: c.y + (randomAt(seed, 44, key) - 0.5) * 3,
    });
  }
  return out;
}

/**
 * Find a block of cells for every title, with at least one free cell between
 * any two titles so they never touch. Titles placed by hand go first, then the
 * rest, biggest first, each at the free spot nearest its seeded target.
 * Purely grid based, so it gives the same answer every time for the same input.
 */
export function planTitles(
  reqs: TitleRequest[],
  columns: number,
  rows: number,
  seed: number,
  keepCategories: boolean,
  manual: Record<string, Placement>,
): { placed: Map<string, Placement>; failed: string[] } {
  const used = new Uint8Array(columns * rows);
  const fits = (c0: number, r0: number, w: number, h: number) => {
    if (c0 < 0 || r0 < 0 || c0 + w > columns || r0 + h > rows) return false;
    for (let r = Math.max(0, r0 - 1); r <= Math.min(rows - 1, r0 + h); r++) {
      for (let c = Math.max(0, c0 - 1); c <= Math.min(columns - 1, c0 + w); c++) if (used[r * columns + c]) return false;
    }
    return true;
  };
  const take = (c0: number, r0: number, w: number, h: number) => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) used[r * columns + c] = 1;
  };

  const placed = new Map<string, Placement>();
  const failed: string[] = [];
  const auto: TitleRequest[] = [];
  for (const r of reqs) {
    const m = manual[r.offering.id];
    if (m && fits(m.col, m.row, r.cols, r.rows)) {
      take(m.col, m.row, r.cols, r.rows);
      placed.set(r.offering.id, { col: m.col, row: m.row });
    } else auto.push(r);
  }

  const aim = targets(reqs, columns, rows, seed, keepCategories);
  const order = auto
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.cols * b.r.rows - a.r.cols * a.r.rows || a.i - b.i)
    .map((x) => x.r);
  for (const r of order) {
    const target = aim.get(r.offering.id)!;
    const key = hashString(r.offering.id);
    let best: Placement | null = null;
    let bestScore = Infinity;
    for (let r0 = 0; r0 + r.rows <= rows; r0++) {
      for (let c0 = 0; c0 + r.cols <= columns; c0++) {
        const score =
          Math.hypot(c0 + (r.cols - 1) / 2 - target.x, r0 + (r.rows - 1) / 2 - target.y) + randomAt(seed, 45, key, c0, r0) * 0.3;
        if (score < bestScore && fits(c0, r0, r.cols, r.rows)) {
          bestScore = score;
          best = { col: c0, row: r0 };
        }
      }
    }
    if (best) {
      take(best.col, best.row, r.cols, r.rows);
      placed.set(r.offering.id, best);
    } else failed.push(r.offering.id);
  }
  return { placed, failed };
}

let suggestionCache: { key: string; value: TitleFit['suggestion'] } | null = null;

/** The smallest grid, no smaller than the current one, where every title finds room. */
export function suggestGrid(
  reqs: TitleRequest[],
  columns: number,
  rows: number,
  seed: number,
  keepCategories: boolean,
  manual: Record<string, Placement>,
): TitleFit['suggestion'] {
  const key = JSON.stringify([reqs.map((r) => [r.offering.id, r.offering.categoryId, r.cols, r.rows]), columns, rows, seed, keepCategories, manual]);
  if (suggestionCache?.key === key) return suggestionCache.value;
  const need = reqs.reduce((n, r) => n + r.cols * r.rows, 0);
  const sizes: { c: number; r: number }[] = [];
  for (let c = columns; c <= MAX_COLUMNS; c++) for (let r = rows; r <= MAX_ROWS; r++) if (c * r >= need) sizes.push({ c, r });
  const aspect = columns / rows;
  sizes.sort((a, b) => a.c * a.r - b.c * b.r || Math.abs(a.c / a.r - aspect) - Math.abs(b.c / b.r - aspect));
  let value: TitleFit['suggestion'] = null;
  for (const s of sizes) {
    if (!planTitles(reqs, s.c, s.r, seed, keepCategories, manual).failed.length) {
      value = { columns: s.c, rows: s.r };
      break;
    }
  }
  suggestionCache = { key, value };
  return value;
}

/** Nearest point on a capsule's centre line, and the distance to its edge (negative inside). */
function capsuleDistance(t: { cx: number; cy: number; halfW: number; halfH: number }, x: number, y: number) {
  const reach = Math.max(t.halfW - t.halfH, 0);
  const px = Math.max(-reach, Math.min(reach, x - t.cx));
  const dx = x - t.cx - px;
  const dy = y - t.cy;
  const len = Math.hypot(dx, dy);
  return { dist: len - t.halfH, nx: len > 1e-9 ? dx / len : 0, ny: len > 1e-9 ? dy / len : 1 };
}

/**
 * Turn placed titles into title shapes on the grid, and make room for them.
 *
 * Remove: the nodes under a title are hidden, links between them are dropped,
 * and links from outside now attach to the title shape.
 *
 * Push apart: the title takes the place of one node, whose links now attach to
 * it. Then the grid opens up: nodes slide away from the title, sideways and
 * up/down, most strongly next to it and fading with distance. Each opening only
 * ever moves points further apart, so nodes keep their order and never cross.
 */
export function buildTitles(
  nodes: SceneNode[],
  links: SceneLink[],
  reqs: TitleRequest[],
  placed: Map<string, Placement>,
  t: TitleSettings,
  ctx: TitleContext,
): { titles: TitleShape[]; links: SceneLink[] } {
  const at = new Map(nodes.map((n) => [`${n.col},${n.row}`, n]));
  const hiddenBy = new Map<string, string>();
  const titles: TitleShape[] = [];

  for (const r of reqs) {
    const p = placed.get(r.offering.id);
    if (!p) continue;
    const under: SceneNode[] = [];
    for (let row = p.row; row < p.row + r.rows; row++)
      for (let col = p.col; col < p.col + r.cols; col++) {
        const n = at.get(`${col},${row}`);
        if (n) under.push(n);
      }
    for (const n of under) {
      n.hidden = true;
      hiddenBy.set(n.id, r.offering.id);
    }
    const o = r.offering;
    titles.push({
      id: o.id,
      categoryId: o.categoryId,
      state: o.state === 'lead' ? 'lead' : 'included',
      color: o.resolvedColor,
      fill: o.state === 'lead' ? o.resolvedColor : lighten(o.resolvedColor, t.includedTint),
      outline: o.state !== 'lead' && t.includedOutline ? o.resolvedColor : undefined,
      lines: r.lines,
      font: t.font,
      weight: t.weight,
      fontSize: r.fontSize,
      align: t.align,
      textColor: t.textColor,
      padX: r.padX,
      // Centred on its block of nodes, moving with their displacement.
      cx: under.reduce((s, n) => s + n.x, 0) / under.length,
      cy: under.reduce((s, n) => s + n.y, 0) / under.length,
      halfW: r.halfW,
      halfH: r.halfH,
      col: p.col,
      row: p.row,
      cols: r.cols,
      rows: r.rows,
    });
  }

  // Links: drop the ones inside a title, attach the rest to the title edge.
  // Only one link per outside node and title: the straight ones win over diagonals.
  const kept: SceneLink[] = [];
  const seen = new Set<string>();
  const ordered = [...links.filter((l) => l.kind !== 'd'), ...links.filter((l) => l.kind === 'd')];
  for (const l of ordered) {
    const tf = hiddenBy.get(l.from);
    const tt = hiddenBy.get(l.to);
    if (tf && tt) continue;
    if (tf || tt) {
      const key = tf ? `${tf}|${l.to}` : `${tt}|${l.from}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    kept.push({ ...l, titleFrom: tf, titleTo: tt });
  }
  const order = new Map(links.map((l, i) => [l.id, i]));
  kept.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  if (t.makeRoom === 'push') openGrid(titles, nodes, ctx);

  // Never let a node sit on a title shape: nudge any that do out to a clear distance.
  const room = ctx.nodeSize + clearance(ctx) * 0.5;
  for (let pass = 0; pass < 2; pass++) {
    for (const n of nodes) {
      if (n.hidden) continue;
      for (const title of titles) {
        const d = capsuleDistance(title, n.x, n.y);
        if (d.dist < room) {
          n.x += d.nx * (room - d.dist);
          n.y += d.ny * (room - d.dist);
        }
      }
    }
  }
  return { titles, links: kept };
}

/**
 * Open the grid around the titles (push apart). Each title inserts a gap on
 * both sides of it, wide enough for the capsule, into its own row; rows above
 * and below open by less, fading over a few rows. Titles taller than a row do
 * the same up and down their column. Gaps only ever grow, so within a row (or
 * column) nodes keep their order and never land on each other.
 */
function openGrid(titles: TitleShape[], nodes: SceneNode[], ctx: TitleContext) {
  const room = ctx.nodeSize + clearance(ctx);
  const fade = (steps: number, gap: number, half: number) => {
    const d = steps * gap;
    const band = half + gap / 2;
    return d <= band ? 1 : Math.exp(-(((d - band) / (2 * gap)) ** 2));
  };
  const opening = titles.map((t) => ({
    t,
    extraX: Math.max(0, t.halfW + room - ctx.gapX),
    extraY: Math.max(0, t.halfH + room - ctx.gapY),
  }));
  const shift = (col: number, row: number, skip?: TitleShape) => {
    let dx = 0;
    let dy = 0;
    for (const { t, extraX, extraY } of opening) {
      if (t === skip) continue;
      dx += Math.sign(col - t.col) * extraX * fade(Math.abs(row - t.row), ctx.gapY, t.halfH);
      dy += Math.sign(row - t.row) * extraY * fade(Math.abs(col - t.col), ctx.gapX, t.halfW);
    }
    return { dx, dy };
  };
  for (const n of nodes) {
    const { dx, dy } = shift(n.col, n.row);
    n.x += dx;
    n.y += dy;
  }
  for (const t of titles) {
    const { dx, dy } = shift(t.col, t.row, t);
    t.cx += dx;
    t.cy += dy;
  }
}

/**
 * Colour spread: nodes and links within `steps` link-steps of a title shape
 * take its colour. Steps are counted along links. Where two titles reach the
 * same node, the nearer wins; on a tie, lead beats included, then list order.
 * At 0 nothing beyond the title shape itself is coloured. An included title
 * spreads a paler tint: `includedStrength` 1 is the full colour, 0 the palest.
 */
export function spreadColors(
  nodes: SceneNode[],
  links: SceneLink[],
  titles: TitleShape[],
  steps: number,
  includedStrength: number,
): void {
  if (steps <= 0 || !titles.length) return;
  const keyOf = (node: string, title?: string) => (title ? `title:${title}` : node);
  const next = new Map<string, string[]>();
  for (const l of links) {
    const a = keyOf(l.from, l.titleFrom);
    const b = keyOf(l.to, l.titleTo);
    next.set(a, [...(next.get(a) ?? []), b]);
    next.set(b, [...(next.get(b) ?? []), a]);
  }
  const tint = (t: TitleShape) =>
    t.state === 'lead' ? t.color : lighten(t.color, (1 - Math.max(0, Math.min(1, includedStrength))) * 0.75);
  // Lead first, then list order: earlier entries win ties.
  const ordered = [...titles.filter((t) => t.state === 'lead'), ...titles.filter((t) => t.state !== 'lead')];
  const owner = new Map<string, { dist: number; color: string }>();
  for (const t of ordered) {
    const color = tint(t);
    let frontier = [keyOf('', t.id)];
    const seen = new Set(frontier);
    for (let d = 0; d <= steps && frontier.length; d++) {
      const after: string[] = [];
      for (const id of frontier) {
        const current = owner.get(id);
        if (!current || d < current.dist) owner.set(id, { dist: d, color });
        for (const n of next.get(id) ?? []) {
          if (!seen.has(n)) {
            seen.add(n);
            after.push(n);
          }
        }
      }
      frontier = after;
    }
  }
  for (const n of nodes) {
    const o = owner.get(n.id);
    if (o && o.dist > 0 && !n.hidden) n.color = o.color;
  }
  // A link is one step further out than its nearer end. It takes that end's colour.
  for (const l of links) {
    const a = owner.get(keyOf(l.from, l.titleFrom));
    const b = owner.get(keyOf(l.to, l.titleTo));
    const near = !a ? b : !b ? a : a.dist <= b.dist ? a : b;
    if (near && near.dist + 1 <= steps) l.color = near.color;
  }
}

/**
 * Blue-only mode with offering colours turned off: every offering gets its own
 * shade of UNICEF blue, darker for the first half of the list and lighter for
 * the second, skipping shades too close to the blue background.
 */
export function blueShade(index: number, count: number): string {
  const p = count > 1 ? index / (count - 1) : 0;
  return p < 0.5 ? darken(BRAND.blue, 0.75 - p * 0.94) : lighten(BRAND.blue, 0.32 + (p - 0.5) * 1.06);
}
