// Owner: bundle B (#20). Local agent HTTP API. Auth: Bearer AGENT_TOKEN (requireAgentToken).
// Signing protocol: the agent sends tx hashes of its own transactions; verify with
// app.ledger.port.verifyTx. In fake mode, when the hash is omitted, use app.ledger.fakeAgent.
// POST /agent/subtasks/:id/screenshot is registered by bundle C in routes/media.ts.
import {
  AgentLogRequest,
  ClaimTaskRequest,
  CreateSubtaskRequest,
  RedeemTaskRequest,
} from "@agent-pledge/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAgentToken } from "../auth";
import { notFound, parseOrThrow } from "../lib/http";
import { loadTaskView } from "../lib/views";
import { appendAgentLog, claimTask, createSubtask, redeemTask } from "../services/tasks";

type IdParams = { Params: { id: string } };

const agentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAgentToken);
  app.post<IdParams>("/agent/tasks/:id/claim", async (req) => ({
    task: await claimTask(app, req.params.id, parseOrThrow(ClaimTaskRequest, req.body ?? {})),
  }));
  app.post<IdParams>("/agent/tasks/:id/subtasks", async (req) =>
    createSubtask(app, req.params.id, parseOrThrow(CreateSubtaskRequest, req.body ?? {})),
  );
  app.get<IdParams>("/agent/tasks/:id", async (req) => {
    const v = await loadTaskView(app.db, app.viewCtx, req.params.id);
    if (!v) throw notFound(`Unknown task ${req.params.id}`);
    return v;
  });
  app.post<IdParams>("/agent/tasks/:id/redeem", async (req) =>
    redeemTask(app, req.params.id, parseOrThrow(RedeemTaskRequest, req.body ?? {})),
  );
  app.post("/agent/log", async (req) => ({
    entry: await appendAgentLog(app, parseOrThrow(AgentLogRequest, req.body ?? {})),
  }));
};

export default agentRoutes;
