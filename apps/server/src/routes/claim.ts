// Owner: bundle C (#21, #22). Claim page API. Public GET; claim issues a helper token
// (issueHelperToken + setHelperCookie from auth.ts); photo needs the helper token (requireHelper).
// POST /claim/:code/pin lives in routes/pin.ts (bundle D).
// Business logic goes in services/claims.ts and services/media.ts.
import type { FastifyPluginAsync } from "fastify";
import { notImplemented } from "../lib/http";

const claimRoutes: FastifyPluginAsync = async (app) => {
  app.get("/claim/:code", async (_req, reply) => notImplemented(reply, "GET /claim/:code"));
  app.post("/claim/:code/claim", async (_req, reply) =>
    notImplemented(reply, "POST /claim/:code/claim"),
  );
  app.post("/claim/:code/photo", async (_req, reply) =>
    notImplemented(reply, "POST /claim/:code/photo"),
  );
};

export default claimRoutes;
