import { useRef, useState, type PointerEvent } from 'react';
import { moveNode, toggleHidden, toggleLink } from '../core/edits';
import { type Hit, hitTest } from '../core/hit';
import type { Measure } from '../core/render';
import type { Scene, Settings } from '../core/types';

type Change = (fn: (s: Settings) => Settings, key?: string) => void;
type Pt = { x: number; y: number };

type Press =
  | { kind: 'title'; id: string; dc: number; dr: number; key: string; pinned: Record<string, { col: number; row: number }> | null }
  | { kind: 'node'; id: string; start: Pt; client: Pt; from: { dx: number; dy: number }; moved: boolean; key: string }
  | { kind: 'gap'; hit: Extract<Hit, { kind: 'gap' }>; client: Pt; moved: boolean };

/** How far (in screen px) the pointer must travel before a press becomes a drag. */
const DRAG_START = 4;

/**
 * Editing on the preview:
 * - drag a title shape to move it (it snaps to grid cells and keeps clear of others),
 * - click a node to hide it, or its faint ghost to show it again,
 * - drag a node to move it,
 * - click the gap between two neighbouring nodes (or a node and a title) to add or remove that link.
 * Every gesture is one undo step.
 */
export function useCanvasInteraction(scene: Scene, size: Measure, settings: Settings, change: Change) {
  const press = useRef<Press | null>(null);
  const [hover, setHover] = useState<Hit | null>(null);
  const [dragging, setDragging] = useState(false);
  const { columns, rows } = settings.params;
  const nodeSize = settings.style.nodeSize;

  const toUnits = (e: PointerEvent<HTMLElement>): Pt => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * size.width;
    const py = ((e.clientY - box.top) / box.height) * size.height;
    return { x: (px - size.offsetX) / size.scale, y: (py - size.offsetY) / size.scale };
  };
  /** The grid cell nearest the pointer, from where the nodes now sit. */
  const cellAt = (u: Pt) => {
    let best = scene.nodes[0];
    let bestD = Infinity;
    for (const n of scene.nodes) {
      const d = Math.hypot(n.x - u.x, n.y - u.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return { col: best.col, row: best.row };
  };
  const travelled = (e: PointerEvent<HTMLElement>, from: Pt) => Math.hypot(e.clientX - from.x, e.clientY - from.y) > DRAG_START;

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const u = toUnits(e);
    const hit = hitTest(scene, nodeSize, u);
    if (!hit) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const client = { x: e.clientX, y: e.clientY };
    if (hit.kind === 'title') {
      const t = scene.titles.find((x) => x.id === hit.id)!;
      const cell = cellAt(u);
      const key = `drag:title:${hit.id}:${Date.now()}`;
      // On the first move, every title is pinned where it is, so the others stay put.
      const pinned = Object.fromEntries(scene.titles.map((x) => [x.id, { col: x.col, row: x.row }]));
      press.current = { kind: 'title', id: hit.id, dc: cell.col - t.col, dr: cell.row - t.row, key, pinned };
      setDragging(true);
    } else if (hit.kind === 'node') {
      const from = settings.edits.moved[hit.id] ?? { dx: 0, dy: 0 };
      press.current = { kind: 'node', id: hit.id, start: u, client, from, moved: false, key: `drag:node:${hit.id}:${Date.now()}` };
    } else {
      press.current = { kind: 'gap', hit, client, moved: false };
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const u = toUnits(e);
    const p = press.current;
    if (!p) {
      setHover(hitTest(scene, nodeSize, u));
      return;
    }
    if (p.kind === 'title') {
      const t = scene.titles.find((x) => x.id === p.id);
      if (!t) return;
      const cell = cellAt(u);
      const col = Math.max(0, Math.min(columns - t.cols, cell.col - p.dc));
      const row = Math.max(0, Math.min(rows - t.rows, cell.row - p.dr));
      const clash = scene.titles.some(
        (o) => o.id !== t.id && o.col <= col + t.cols && col <= o.col + o.cols && o.row <= row + t.rows && row <= o.row + o.rows,
      );
      if ((col === t.col && row === t.row) || clash) return;
      const pinned = p.pinned;
      p.pinned = null;
      change(
        (s) => ({
          ...s,
          offerings: {
            ...s.offerings,
            titles: {
              ...s.offerings.titles,
              positions: { ...(pinned ?? s.offerings.titles.positions), [t.id]: { col, row } },
            },
          },
        }),
        p.key,
      );
      return;
    }
    if (p.kind === 'gap') {
      if (travelled(e, p.client)) p.moved = true;
      return;
    }
    if (!p.moved && !travelled(e, p.client)) return;
    p.moved = true;
    setDragging(true);
    const dx = p.from.dx + (u.x - p.start.x);
    const dy = p.from.dy + (u.y - p.start.y);
    change((s) => ({ ...s, edits: moveNode(s.edits, p.id, dx, dy) }), p.key);
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    press.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!p || e.type === 'pointercancel') return;
    if (p.kind === 'node' && !p.moved) change((s) => ({ ...s, edits: toggleHidden(s.edits, p.id) }));
    if (p.kind === 'gap' && !p.moved)
      change((s) => ({ ...s, edits: toggleLink(s.edits, p.hit.a, p.hit.b, p.hit.existing) }));
    setHover(hitTest(scene, nodeSize, toUnits(e)));
  };

  const cursor = dragging ? 'grabbing' : hover?.kind === 'title' ? 'grab' : hover ? 'pointer' : undefined;
  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onPointerLeave: () => !press.current && setHover(null),
    },
    cursor,
    hover: dragging ? null : hover,
  };
}

/**
 * Preview-only marks drawn over the picture: faint ghosts where nodes are
 * hidden (so they can be clicked back) and a hint for what a click would do.
 * Never part of any export.
 */
export function EditOverlay({ scene, size, nodeSize, hover }: { scene: Scene; size: Measure; nodeSize: number; hover: Hit | null }) {
  const k = size.scale;
  const px = (p: Pt) => ({ x: p.x * k + size.offsetX, y: p.y * k + size.offsetY });
  const r = nodeSize * k;
  const ghosts = scene.nodes.filter((n) => n.userHidden).map((n) => ({ id: n.id, ...px(n) }));
  const node = hover?.kind === 'node' ? scene.nodes.find((n) => n.id === hover.id) : undefined;
  const gap = hover?.kind === 'gap' ? { a: px(hover.from), b: px(hover.to), remove: !!hover.existing } : null;
  return (
    <svg className="overlay" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
      {ghosts.map((g) => (
        <circle key={g.id} cx={g.x} cy={g.y} r={r} className="ghost" vectorEffect="non-scaling-stroke" />
      ))}
      {node && (
        <circle cx={px(node).x} cy={px(node).y} r={r + 2 * k} className="hint" vectorEffect="non-scaling-stroke" />
      )}
      {gap && (
        <line
          x1={gap.a.x}
          y1={gap.a.y}
          x2={gap.b.x}
          y2={gap.b.y}
          className={gap.remove ? 'hint remove' : 'hint add'}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
