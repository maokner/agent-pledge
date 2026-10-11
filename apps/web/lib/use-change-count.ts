"use client";

import { useState } from "react";

/**
 * How many times `value` changed since this component mounted. 0 on mount,
 * so nothing animates on first paint. Use it as a React `key` to restart a
 * CSS animation each time the value changes:
 *
 *   const changes = useChangeCount(task.status);
 *   {changes > 0 && <span key={changes} className="animate-card-glow" />}
 */
export function useChangeCount<T>(value: T): number {
  const [state, setState] = useState({ value, count: 0 });
  if (!Object.is(state.value, value)) {
    // Adjusting state while rendering, the React way to react to a prop change.
    const next = { value, count: state.count + 1 };
    setState(next);
    return next.count;
  }
  return state.count;
}
