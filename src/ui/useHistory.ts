import { useCallback, useReducer, useRef } from 'react';

const LIMIT = 100;

/**
 * Undo and redo over whole settings. Changes made with the same `key` in
 * quick succession (a slider being dragged, a node or title being moved) are
 * merged into one step, so one undo takes back the whole gesture. Keys that
 * start with "drag" merge for as long as the gesture lasts.
 */
export function useHistory<T>(initial: () => T) {
  const state = useRef<{ past: T[]; present: T; future: T[] } | null>(null);
  state.current ??= { past: [], present: initial(), future: [] };
  const last = useRef<{ key?: string; time: number }>({ time: 0 });
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const update = useCallback((fn: (current: T) => T, key?: string) => {
    const h = state.current!;
    const next = fn(h.present);
    if (next === h.present) return;
    const now = Date.now();
    const merge = key !== undefined && key === last.current.key && (key.startsWith('drag') || now - last.current.time < 800);
    last.current = { key, time: now };
    state.current = merge
      ? { ...h, present: next, future: [] }
      : { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
    rerender();
  }, []);

  const undo = useCallback(() => {
    const h = state.current!;
    if (!h.past.length) return;
    state.current = { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    last.current = { time: 0 };
    rerender();
  }, []);

  const redo = useCallback(() => {
    const h = state.current!;
    if (!h.future.length) return;
    state.current = { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    last.current = { time: 0 };
    rerender();
  }, []);

  const h = state.current;
  return { value: h.present, update, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
