// Owner: bundle D (#24). POST /admin/tasks/:id/fail (Bearer AGENT_TOKEN) -> services/settlement.ts failure flow.
// Also hosts the deadline scheduler: started onReady, stopped onClose.
import { AdminFailRequest, type AdminFailResponse } from "@agent-pledge/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAgentToken } from "../auth";
import { parseOrThrow } from "../lib/http";
import { failTask } from "../services/settlement";
import { startScheduler } from "../services/scheduler";

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/admin/tasks/:id/fail",
    { preHandler: requireAgentToken },
    async (req): Promise<AdminFailResponse> => {
      const { id } = req.params as { id: string };
      const body = parseOrThrow(AdminFailRequest, req.body ?? {});
      const task = await failTask(app, id, body.reason?.trim() || "manual");
      return { task };
    },
  );

  let stop: (() => void) | null = null;
  app.addHook("onReady", async () => {
    stop = startScheduler(app);
  });
  app.addHook("onClose", async () => {
    stop?.();
  });
};

export default adminRoutes;
