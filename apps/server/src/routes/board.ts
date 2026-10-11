// Owner: bundle B (#25). GET /board/state -> BoardState.
import type { FastifyPluginAsync } from "fastify";
import { loadBoardState } from "../lib/views";

const boardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/board/state", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    return loadBoardState(app.db, app.viewCtx, app.bus.latestSeq, app.clock.now());
  });
};

export default boardRoutes;
