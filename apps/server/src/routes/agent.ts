// Owner: bundle B (#20). Local agent HTTP API. Auth: Bearer AGENT_TOKEN (requireAgentToken).
// Signing protocol: the agent sends tx hashes of its own transactions; verify with
// app.ledger.port.verifyTx. In fake mode, when the hash is omitted, use app.ledger.fakeAgent.
// POST /agent/subtasks/:id/screenshot is implemented by bundle C (#22) via services/media.ts —
// bundle B keeps the route here and calls into services/media.ts.
import type { FastifyPluginAsync } from "fastify";
import { requireAgentToken } from "../auth";
import { notImplemented } from "../lib/http";

const agentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAgentToken);
  app.post("/agent/tasks/:id/claim", async (_req, reply) =>
    notImplemented(reply, "POST /agent/tasks/:id/claim"),
  );
  app.post("/agent/tasks/:id/subtasks", async (_req, reply) =>
    notImplemented(reply, "POST /agent/tasks/:id/subtasks"),
  );
  app.get("/agent/tasks/:id", async (_req, reply) => notImplemented(reply, "GET /agent/tasks/:id"));
  app.post("/agent/tasks/:id/redeem", async (_req, reply) =>
    notImplemented(reply, "POST /agent/tasks/:id/redeem"),
  );
  app.post("/agent/log", async (_req, reply) => notImplemented(reply, "POST /agent/log"));
};

export default agentRoutes;
