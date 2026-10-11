// Owner: bundle C (#21, #22). Claim page API. Public GET; claim issues a helper token
// (issueHelperToken + setHelperCookie from auth.ts); photo needs the helper token (requireHelper).
// POST /claim/:code/pin lives in routes/pin.ts (bundle D).
// Business logic goes in services/claims.ts and services/media.ts.
import {
  ErrorCode,
  PhotoFields,
  type ClaimSubtaskResponse,
  type ClaimView,
  type PhotoResponse,
} from "@agent-pledge/shared";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { helperFromRequest, requireHelper, setHelperCookie } from "../auth";
import type { SubtaskRow } from "../db/schema";
import { HttpError, notFound, parseOrThrow } from "../lib/http";
import { loadClaimView } from "../lib/views";
import { claimSubtask, expired, findByCode, isExpired } from "../services/claims";
import { addHelperPhoto, readUpload } from "../services/media";
import { setupHelperWalletPool } from "../services/wallet-pool";

type CodeParams = { Params: { code: string } };

/** True when the request carries a helper token for this sub-task's actual helper wallet. */
function isClaimer(req: FastifyRequest, code: string, s: SubtaskRow): boolean {
  const h = helperFromRequest(req, code, s.id);
  return !!h && !!s.helperWalletId && h.wid === s.helperWalletId;
}

async function claimView(app: FastifyInstance, code: string, byYou: boolean): Promise<ClaimView> {
  const v = await loadClaimView(app.db, app.viewCtx, code, byYou);
  if (!v) throw notFound("Unknown claim code");
  return v;
}

const claimRoutes: FastifyPluginAsync = async (app) => {
  const pool = setupHelperWalletPool(app);

  app.get<CodeParams>("/claim/:code", async (req) => {
    const { code, subtask } = await findByCode(app, req.params.code);
    return claimView(app, code, isClaimer(req, code, subtask));
  });

  app.post<CodeParams>("/claim/:code/claim", async (req, reply) => {
    const r = await claimSubtask(app, pool, req.params.code);
    setHelperCookie(reply, app.config, r.code, r.helperToken);
    const body: ClaimSubtaskResponse = {
      helper_token: r.helperToken,
      claim: await claimView(app, r.code, true),
    };
    return body;
  });

  app.post<CodeParams>("/claim/:code/photo", async (req) => {
    const { code, subtask, task } = await findByCode(app, req.params.code);
    const h = requireHelper(req, code, subtask.id);
    if (h.wid !== subtask.helperWalletId) {
      throw new HttpError(401, ErrorCode.unauthorized, "You did not claim this task");
    }
    if (isExpired(app, subtask, task)) throw expired();
    if (subtask.status !== "claimed") {
      throw new HttpError(409, ErrorCode.conflict, "This task is already finished");
    }
    const upload = await readUpload(req);
    const fields = parseOrThrow(PhotoFields, { note: upload.fields.note || undefined });
    const media = await addHelperPhoto(app, subtask, { file: upload.file, note: fields.note });
    const body: PhotoResponse = { claim: await claimView(app, code, true), media };
    return body;
  });
};

export default claimRoutes;
