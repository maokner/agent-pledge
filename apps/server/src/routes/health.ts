// Owner: foundation (#16).
import type { HealthResponse } from "@agent-pledge/shared";
import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (): Promise<HealthResponse> => {
    return { ok: true, ledger_mode: app.ledger.mode, time: app.clock.now().toISOString() };
  });
};

export default healthRoutes;
