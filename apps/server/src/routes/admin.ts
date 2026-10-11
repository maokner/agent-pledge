// Owner: bundle D (#24). POST /admin/tasks/:id/fail (Bearer AGENT_TOKEN) -> services/settlement.ts failure flow.
import type { FastifyPluginAsync } from "fastify";
import { requireAgentToken } from "../auth";
import { notImplemented } from "../lib/http";

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post("/admin/tasks/:id/fail", { preHandler: requireAgentToken }, async (_req, reply) =>
    notImplemented(reply, "POST /admin/tasks/:id/fail"),
  );
};

export default adminRoutes;
