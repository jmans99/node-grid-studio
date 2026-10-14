import { useRef, useState, type PointerEvent } from 'react';
import type { Measure } from '../core/render';
import type { Scene, TitleSettings } from '../core/types';

type Titles = Scene['titles'];

/**
 * Drag title shapes in the preview. A title snaps from grid cell to grid cell
 * and only moves to spots where it keeps clear of the other titles. When a
 * drag starts, every title is pinned where it is, so the others stay put.
 */
export function useTitleDrag(
  scene: Scene,
  size: Measure,
  columns: number,
  rows: number,
  update: (fn: (t: TitleSettings) => TitleSettings) => void,
) {
  const drag = useRef<{ id: string; dc: number; dr: number } | null>(null);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** Pointer position in scene units. */
  const toUnits = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * size.width;
    const py = ((e.clientY - box.top) / box.height) * size.height;
    return { x: (px - size.offsetX) / size.scale, y: (py - size.offsetY) / size.scale };
  };
  const titleAt = (u: { x: number; y: number }) =>
    scene.titles.find((t) => Math.abs(u.x - t.cx) <= t.halfW && Math.abs(u.y - t.cy) <= t.halfH);
  /** The grid cell nearest the pointer, found from where the nodes now sit. */
  const cellAt = (u: { x: number; y: number }) => {
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
  const clashes = (titles: Titles, id: string, col: number, row: number, cols: number, rowsTall: number) =>
    titles.some(
      (o) => o.id !== id && o.col <= col + cols && col <= o.col + o.cols && o.row <= row + rowsTall && row <= o.row + o.rows,
    );

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const u = toUnits(e);
    const t = titleAt(u);
    if (!t) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = cellAt(u);
    drag.current = { id: t.id, dc: cell.col - t.col, dr: cell.row - t.row };
    setDragging(true);
    const pinned = Object.fromEntries(scene.titles.map((x) => [x.id, { col: x.col, row: x.row }]));
    update((ts) => ({ ...ts, positions: pinned }));
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const u = toUnits(e);
    if (!drag.current) {
      setHover(!!titleAt(u));
      return;
    }
    const { id, dc, dr } = drag.current;
    const t = scene.titles.find((x) => x.id === id);
    if (!t) return;
    const cell = cellAt(u);
    const col = Math.max(0, Math.min(columns - t.cols, cell.col - dc));
    const row = Math.max(0, Math.min(rows - t.rows, cell.row - dr));
    if ((col === t.col && row === t.row) || clashes(scene.titles, id, col, row, t.cols, t.rows)) return;
    update((ts) => ({ ...ts, positions: { ...ts.positions, [id]: { col, row } } }));
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    cursor: dragging ? 'grabbing' : hover ? 'grab' : undefined,
  };
}
