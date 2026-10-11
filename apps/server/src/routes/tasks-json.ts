// Owner: bundle B (#19/#25). GET /tasks/:id.json -> NftUriData for a task OR a sub-task ID (NFT URI target).
// Sub-tasks include parent_task_id and parent_nft_id (PRD 5.3). Public, no auth.
import type { FastifyPluginAsync } from "fastify";
import { notImplemented } from "../lib/http";

const tasksJsonRoutes: FastifyPluginAsync = async (app) => {
  // Fastify treats "." as a literal here: matches /tasks/task_abc.json and /tasks/sub_abc.json.
  app.get("/tasks/:id.json", async (_req, reply) => notImplemented(reply, "GET /tasks/:id.json"));
};

export default tasksJsonRoutes;
