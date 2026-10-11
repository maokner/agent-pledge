// Owner: bundle C (#22). GET /media/:id -> the image bytes from the media table, with its mime type
// and a long Cache-Control (media is immutable). Public, no auth.
import type { FastifyPluginAsync } from "fastify";
import { notImplemented } from "../lib/http";

const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/media/:id", async (_req, reply) => notImplemented(reply, "GET /media/:id"));
};

export default mediaRoutes;
