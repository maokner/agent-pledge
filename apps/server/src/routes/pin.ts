// Owner: bundle D (#23). POST /claim/:code/pin. Needs the helper token (requireHelper from auth.ts).
// Wrong PIN -> 422 wrong_pin + pin.failed; third wrong -> 423 pin_locked + pin.locked.
// Correct PIN -> services/settlement.ts pays the helper, then notifies the agent (task.redeemable).
import type { FastifyPluginAsync } from "fastify";
import { notImplemented } from "../lib/http";

const pinRoutes: FastifyPluginAsync = async (app) => {
  app.post("/claim/:code/pin", async (_req, reply) =>
    notImplemented(reply, "POST /claim/:code/pin"),
  );
};

export default pinRoutes;
