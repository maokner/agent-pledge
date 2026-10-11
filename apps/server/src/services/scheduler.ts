// Owner: bundle D (#24). In-process deadline checker every SCHEDULER_INTERVAL_MS: fail tasks past their
// deadline (no claim, or no correct PIN) via services/settlement.ts. Must be idempotent across restarts.
import type { FastifyInstance } from "fastify";

/** Starts the scheduler; returns a stop function. Called from server.ts (not in tests). */
export function startScheduler(_app: FastifyInstance): () => void {
  return () => {};
}
