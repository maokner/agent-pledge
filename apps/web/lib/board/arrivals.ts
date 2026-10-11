/**
 * Which tasks arrived while the board was open, for the new-task arrival
 * flash (docs/design/agent-design-system.md). The tasks on the board when
 * it first becomes ready are the baseline and never flash, like
 * useChangeCount's "nothing animates on first paint".
 */

export interface Arrivals {
  /** Every task ID seen since the baseline; null until the board is ready. */
  known: ReadonlySet<string> | null;
  /** Task IDs that showed up after the baseline. */
  arrived: ReadonlySet<string>;
}

export const NO_ARRIVALS: Arrivals = { known: null, arrived: new Set() };

/**
 * The next Arrivals for the task IDs on the board now. `ready` is true once
 * the first snapshot is in (or the socket is open). Returns `prev` itself
 * when nothing new arrived.
 */
export function trackArrivals(prev: Arrivals, ids: readonly string[], ready: boolean): Arrivals {
  if (!ready) return prev;
  if (prev.known === null) return { known: new Set(ids), arrived: prev.arrived };
  const fresh = ids.filter((id) => !prev.known!.has(id));
  if (fresh.length === 0) return prev;
  return { known: new Set([...prev.known, ...fresh]), arrived: new Set([...prev.arrived, ...fresh]) };
}
