// Owner: bundle B (#25). GET /board/state -> BoardState (use loadBoardState from lib/views.ts with app.bus.latestSeq).
import type { FastifyPluginAsync } from "fastify";
import { notImplemented } from "../lib/http";

const boardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/board/state", async (_req, reply) => notImplemented(reply, "GET /board/state"));
};

export default boardRoutes;
