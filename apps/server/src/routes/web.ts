// The board and the claim page (apps/web/public), served from this server so that the pages,
// the JSON API, and /ws/board share one origin (one tunnel URL, no CORS).
// GET /        -> index.html (the board)
// GET /c/:code -> claim.html (the claim page; the JSON API stays at /claim/:code)
// Other files (board.js, styles.css, fixtures/...) are served by @fastify/static.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyPluginAsync } from "fastify";
import { SERVER_ROOT } from "../config";

export const WEB_ROOT = resolve(SERVER_ROOT, "../web/public");

const webRoutes: FastifyPluginAsync = async (app) => {
  if (!existsSync(WEB_ROOT)) {
    app.log.warn({ root: WEB_ROOT }, "web root missing, board and claim page not served");
    return;
  }
  await app.register(fastifyStatic, {
    root: WEB_ROOT,
    prefix: "/",
    // Register one route per file at startup instead of a catch-all, so unknown paths keep the
    // API's JSON 404 and no API route can be shadowed.
    wildcard: false,
    index: false,
    // Demo pages change often; always revalidate.
    cacheControl: false,
    setHeaders: (reply) => reply.header("Cache-Control", "no-cache"),
  });

  app.get("/", (_req, reply) => reply.sendFile("index.html"));
  app.get("/c/:code", (_req, reply) => reply.sendFile("claim.html"));
};

export default webRoutes;
