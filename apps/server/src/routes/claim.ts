// Owner: bundle C (#21, #22). Claim page API. Public GET; claim issues a helper token
// (issueHelperToken + setHelperCookie from auth.ts); photo and pay need the helper token (requireHelper).
// In PROOF_MODE=photo the proof photo pays the helper (services/settlement.ts payHelper), and
// POST /claim/:code/pay retries that payout. POST /claim/:code/pin lives in routes/pin.ts (bundle D).
// Business logic goes in services/claims.ts, services/media.ts, and services/settlement.ts.
import {
  ErrorCode,
  PhotoFields,
  type ClaimSubtaskResponse,
  type ClaimView,
  type PayResponse,
  type PhotoResponse,
} from "@agent-pledge/shared";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { helperFromRequest, requireHelper, setHelperCookie } from "../auth";
import type { SubtaskRow, TaskRow } from "../db/schema";
import { HttpError, notFound, parseOrThrow } from "../lib/http";
import { loadClaimView } from "../lib/views";
import { claimSubtask, expired, findByCode, isExpired } from "../services/claims";
import { addHelperPhoto, readUpload } from "../services/media";
import { payHelper, type HelperPayout } from "../services/settlement";
import { setupHelperWalletPool } from "../services/wallet-pool";

type CodeParams = { Params: { code: string } };

/** True when the request carries a helper token for this sub-task's actual helper wallet. */
function isClaimer(req: FastifyRequest, code: string, s: SubtaskRow): boolean {
  const h = helperFromRequest(req, code, s.id);
  return !!h && !!s.helperWalletId && h.wid === s.helperWalletId;
}

/** The helper token must belong to the wallet that claimed this sub-task. */
function requireClaimer(req: FastifyRequest, code: string, s: SubtaskRow): void {
  const h = requireHelper(req, code, s.id);
  if (h.wid !== s.helperWalletId) {
    throw new HttpError(401, ErrorCode.unauthorized, "You did not claim this task");
  }
}

const isPaid = (s: SubtaskRow) => !!(s.paidAt && s.payoutTxHash);

/** The photo and pay endpoints work only on a claimed, live sub-task. */
function requireWorkable(app: FastifyInstance, s: SubtaskRow, t: TaskRow): void {
  if (isExpired(app, s, t)) throw expired();
  if (s.status !== "claimed") {
    throw new HttpError(409, ErrorCode.conflict, "This task is already finished");
  }
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
    requireClaimer(req, code, subtask);
    requireWorkable(app, subtask, task);
    const upload = await readUpload(req);
    const fields = parseOrThrow(PhotoFields, { note: upload.fields.note || undefined });
    const media = await addHelperPhoto(app, subtask, { file: upload.file, note: fields.note });
    // The photo is saved. In photo mode it is the proof: pay now. A ledger error answers 502 and
    // keeps the photo; the client retries with POST /claim/:code/pay.
    let payout: HelperPayout | null = null;
    if (app.config.PROOF_MODE === "photo" && media) payout = await payHelper(app, subtask.id);
    const body: PhotoResponse = { claim: await claimView(app, code, true), media, payout };
    return body;
  });

  app.post<CodeParams>("/claim/:code/pay", async (req) => {
    const { code, subtask, task } = await findByCode(app, req.params.code);
    requireClaimer(req, code, subtask);
    if (app.config.PROOF_MODE === "pin") {
      throw new HttpError(409, ErrorCode.conflict, "The requester's PIN pays this task");
    }
    // Idempotent: after success (or a lost response) return the same payout.
    if (!isPaid(subtask)) {
      requireWorkable(app, subtask, task);
      if (!subtask.photoMediaId) {
        throw new HttpError(409, ErrorCode.conflict, "Send the proof photo first");
      }
    }
    const payout = await payHelper(app, subtask.id);
    const body: PayResponse = { claim: await claimView(app, code, true), payout };
    return body;
  });
};

export default claimRoutes;
