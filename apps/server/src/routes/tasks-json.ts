// Owner: bundle B (#19/#25). GET /tasks/:id.json -> NftUriData for a task OR a sub-task ID (NFT URI target).
// Sub-tasks include parent_task_id and parent_nft_id (PRD 5.3). Public, no auth.
import type { FastifyPluginAsync } from "fastify";
import { nftUriData } from "../services/tasks";

const tasksJsonRoutes: FastifyPluginAsync = async (app) => {
  // Fastify treats "." as a literal here: matches /tasks/task_abc.json and /tasks/sub_abc.json.
  app.get<{ Params: { id: string } }>("/tasks/:id.json", async (req) =>
    nftUriData(app, req.params.id),
  );
};

export default tasksJsonRoutes;
