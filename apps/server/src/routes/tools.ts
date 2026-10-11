// Owner: bundle B (#19). Voice agent tools. Auth: x-agent-pledge-secret (requireVoiceSecret).
// Contract: docs/api.md + CreateTaskRequest/CreateTaskResponse/TaskStatusResponse in @agent-pledge/shared.
// Business logic goes in services/tasks.ts.
import type { FastifyPluginAsync } from "fastify";
import { requireVoiceSecret } from "../auth";
import { notImplemented } from "../lib/http";

const toolsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/tools/create_task", { preHandler: requireVoiceSecret }, async (_req, reply) =>
    notImplemented(reply, "POST /tools/create_task"),
  );
  app.get("/tools/task_status/:taskId", { preHandler: requireVoiceSecret }, async (_req, reply) =>
    notImplemented(reply, "GET /tools/task_status/:taskId"),
  );
};

export default toolsRoutes;
