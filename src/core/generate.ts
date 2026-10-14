import { fractalNoise2D } from './noise';
import { hashInts, randomAt } from './random';
import { resolveOfferings } from './offerings';
import { applyLinkEdits } from './edits';
import { blueShade, buildTitles, keepClearOfTitles, planTitles, spreadColors, suggestGrid, titleRequests } from './titles';
import type { Edits, OfferingsSettings, Params, Scene, SceneLink, SceneNode, TitleFit } from './types';

/** How fast the noise changes across the grid. Lower means smoother waves. */
const NOISE_SCALE = 0.3;
/** Value noise rarely reaches +-1, so push it up a little. */
const NOISE_GAIN = 1.5;

export const nodeId = (col: number, row: number) => `${col},${row}`;

/**
 * Build a scene from layout settings. Pure: the same params always give the
 * same scene.
 *
 * Links: every node can join the neighbour to its right, below it, and one of
 * the two diagonals in the cell below-right. Each cell picks its diagonal from
 * the seed, so two diagonals can never cross. Density then keeps the first
 * share of those links, ranked by a seeded priority. Raising density only ever
 * adds links.
 *
 * `offerings` adds the title shapes and the colour spread around them.
 */
export interface GenerateContext {
  /** Node radius in units: title shapes are sized to clear the nodes around them. */
  nodeSize: number;
  /** The blue-only background is on. */
  blueMode: boolean;
  /** Changes made by hand on the canvas. */
  edits?: Edits;
}

export function generate(
  params: Params,
  offerings?: OfferingsSettings,
  context: GenerateContext = { nodeSize: 5, blueMode: false },
): Scene {
  const { columns, rows, density, displacement, seed, gapX, gapY } = params;

  const nodes: SceneNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const gx = col * gapX;
      const gy = row * gapY;
      const dx = clamp1(fractalNoise2D(seed, col * NOISE_SCALE, row * NOISE_SCALE, 0) * NOISE_GAIN);
      const dy = clamp1(fractalNoise2D(seed, col * NOISE_SCALE, row * NOISE_SCALE, 1) * NOISE_GAIN);
      nodes.push({
        id: nodeId(col, row),
        col,
        row,
        gx,
        gy,
        x: gx + dx * displacement,
        y: gy + dy * displacement,
        seed: hashInts(seed, 9, col, row),
        pick: randomAt(seed, 11, col, row),
      });
    }
  }

  const candidates: (SceneLink & { priority: number })[] = [];
  const add = (
    kind: SceneLink['kind'],
    code: number,
    c1: number,
    r1: number,
    c2: number,
    r2: number,
    col: number,
    row: number,
  ) => {
    // Sideways links leave sideways, up/down links leave up/down. Diagonals pick
    // one or the other from the seed. Only elbow and curved lines use this.
    const bend = kind === 'h' ? 'h' : kind === 'v' ? 'v' : randomAt(seed, 5, col, row) < 0.5 ? 'h' : 'v';
    candidates.push({
      id: `${nodeId(c1, r1)}-${nodeId(c2, r2)}`,
      from: nodeId(c1, r1),
      to: nodeId(c2, r2),
      kind,
      bend,
      priority: randomAt(seed, 2, code, col, row),
    });
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (col + 1 < columns) add('h', 0, col, row, col + 1, row, col, row);
      if (row + 1 < rows) add('v', 1, col, row, col, row + 1, col, row);
      if (col + 1 < columns && row + 1 < rows) {
        if (randomAt(seed, 1, col, row) < 0.5) add('d', 2, col, row, col + 1, row + 1, col, row);
        else add('d', 3, col + 1, row, col, row + 1, col, row);
      }
    }
  }

  const keep = Math.min(candidates.length, Math.floor(density * candidates.length + 1e-9));
  const ranked = candidates
    .map((link, index) => ({ index, priority: link.priority }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, keep);
  const chosen = new Set(ranked.map((r) => r.index));
  const generated: SceneLink[] = candidates
    .filter((_, index) => chosen.has(index))
    .map(({ id, from, to, kind, bend }) => ({ id, from, to, kind, bend }));

  // Hand edits sit on top: links added or removed, nodes hidden.
  const edits = context.edits;
  let links = edits ? applyLinkEdits(generated, nodes, edits, seed) : generated;
  if (edits?.hidden.length) {
    const hidden = new Set(edits.hidden);
    for (const n of nodes) if (hidden.has(n.id)) n.hidden = n.userHidden = true;
    links = links.filter((l) => !hidden.has(l.from) && !hidden.has(l.to));
  }

  // Offerings: each active one becomes a title shape on the grid, and its colour
  // spreads to the nodes and links around it.
  let titles: Scene['titles'] = [];
  let fit: TitleFit | undefined;
  let resolved = offerings ? resolveOfferings(offerings) : [];
  const t = offerings?.titles;
  const ctx = { nodeSize: context.nodeSize, gapX, gapY };
  if (offerings && t) {
    if (context.blueMode && !offerings.blueModeColors) {
      resolved = resolved.map((o, i) => ({ ...o, resolvedColor: blueShade(i, resolved.length) }));
    }
    const requests = titleRequests(resolved, t, ctx);
    const { placed, failed } = planTitles(requests, columns, rows, seed, t.keepCategories, t.positions);
    const built = buildTitles(nodes, links, requests, placed, t, ctx);
    titles = built.titles;
    links = built.links;
    // Titles never overlap. When some do not fit, say so and suggest a grid that fits them all.
    if (failed.length) {
      fit = {
        placed: placed.size,
        total: requests.length,
        suggestion: suggestGrid(requests, columns, rows, seed, t.keepCategories, t.positions),
      };
    }
  }

  // Nodes dragged by hand move from wherever the layout put them, but still keep clear of titles.
  if (edits) {
    for (const n of nodes) {
      const m = edits.moved[n.id];
      if (!m) continue;
      n.x += m.dx;
      n.y += m.dy;
      n.moved = true;
    }
  }
  if (titles.length) keepClearOfTitles(nodes, titles, ctx);
  if (offerings) spreadColors(nodes, links, titles, offerings.spread, offerings.includedSpread);

  return { nodes, links, titles, gapX, gapY, ...(fit ? { fit } : {}) };
}

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
