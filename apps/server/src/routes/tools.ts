// Owner: bundle B (#19). Voice agent tools. Auth: x-agent-pledge-secret (requireVoiceSecret).
// Contract: docs/api.md + CreateTaskRequest/CreateTaskResponse/TaskStatusResponse in @agent-pledge/shared.
// Business logic goes in services/tasks.ts.
import { CreateTaskRequest } from "@agent-pledge/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireVoiceSecret } from "../auth";
import { parseOrThrow } from "../lib/http";
import { createTask, tasksIdle, taskStatus } from "../services/tasks";

const toolsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/tools/create_task", { preHandler: requireVoiceSecret }, async (req) =>
    createTask(app, parseOrThrow(CreateTaskRequest, req.body ?? {})),
  );
  app.get<{ Params: { taskId: string } }>(
    "/tools/task_status/:taskId",
    { preHandler: requireVoiceSecret },
    async (req) => taskStatus(app, req.params.taskId),
  );
  // Let in-flight ledger setups finish (bounded) before the DB closes.
  app.addHook("onClose", async () => {
    await Promise.race([tasksIdle(app), new Promise((r) => setTimeout(r, 10_000).unref())]);
  });
};

export default toolsRoutes;
