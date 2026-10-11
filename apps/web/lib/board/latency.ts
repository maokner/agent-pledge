/**
 * Measures PRD R3, "the board updates in less than 2 seconds after each
 * change": for each board event, the time from the server's `at` to the
 * moment the board painted it.
 *
 * - transitMs: server `at` -> the browser received it. Compares the
 *   server's clock with the browser's, so clock skew shows up here.
 * - renderMs: received -> painted. Browser clock only.
 * - totalMs: transitMs + renderMs, the number R3 is about.
 *
 * Framework-free. useBoard feeds `received` from the sync layer, and
 * LatencyMeter calls `rendered` after React commits and the browser paints.
 */
import type { BoardEvent } from "@/lib/contract";

/** PRD R3: the board updates in less than 2 seconds after each change. */
export const R3_BUDGET_MS = 2000;

export interface LatencySample {
  seq: number;
  transitMs: number;
  renderMs: number;
  totalMs: number;
}

export interface LatencyStats {
  /** The most recently painted event. */
  last: LatencySample | null;
  /** Events measured since the page opened. */
  count: number;
  /** Worst totalMs among the most recent `window` events. */
  worstTotalMs: number | null;
  /** Events since the page opened whose totalMs exceeded R3_BUDGET_MS. */
  overBudget: number;
}

export interface LatencyTracker {
  /** An event arrived at `receivedAt` (epoch ms). */
  received(event: Pick<BoardEvent, "seq" | "at">, receivedAt: number): void;
  /** The board painted everything up to `seq` at `renderedAt` (epoch ms). */
  rendered(seq: number, renderedAt: number): void;
  stats(): LatencyStats;
}

export function createLatencyTracker({ window = 20 }: { window?: number } = {}): LatencyTracker {
  let pending: { seq: number; eventAt: number; receivedAt: number }[] = [];
  let recent: LatencySample[] = [];
  let count = 0;
  let overBudget = 0;

  return {
    received(event, receivedAt) {
      pending.push({ seq: event.seq, eventAt: Date.parse(event.at), receivedAt });
    },
    rendered(seq, renderedAt) {
      const done = pending.filter((p) => p.seq <= seq);
      if (done.length === 0) return;
      pending = pending.filter((p) => p.seq > seq);
      for (const p of done) {
        const sample = {
          seq: p.seq,
          transitMs: p.receivedAt - p.eventAt,
          renderMs: renderedAt - p.receivedAt,
          totalMs: renderedAt - p.eventAt,
        };
        count++;
        if (sample.totalMs > R3_BUDGET_MS) overBudget++;
        recent.push(sample);
      }
      recent = recent.slice(-window);
    },
    stats() {
      return {
        last: recent.at(-1) ?? null,
        count,
        worstTotalMs: recent.length ? Math.max(...recent.map((s) => s.totalMs)) : null,
        overBudget,
      };
    },
  };
}
