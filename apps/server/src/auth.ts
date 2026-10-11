/**
 * Auth helpers.
 * - Voice agent: header `x-agent-pledge-secret: <VOICE_SHARED_SECRET>` -> requireVoiceSecret.
 * - Local agent: `Authorization: Bearer <AGENT_TOKEN>` (or `?token=` on /ws/agent) -> requireAgentToken.
 * - Helper: a token bound to one sub-task, issued by POST /claim/:code/claim. It is returned in the JSON
 *   body AND set as a signed cookie `ap_helper_<CODE>`. Helper endpoints accept the cookie,
 *   `Authorization: Bearer <token>`, or `x-helper-token: <token>` -> getHelperToken / requireHelper.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ErrorCode } from "@agent-pledge/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config";
import { HttpError } from "./lib/http";

export const VOICE_SECRET_HEADER = "x-agent-pledge-secret";
export const HELPER_TOKEN_HEADER = "x-helper-token";
export const helperCookieName = (code: string) => `ap_helper_${code}`;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() ?? null;
}

const unauthorized = (msg = "Unauthorized") => new HttpError(401, ErrorCode.unauthorized, msg);

/** preHandler for /tools/*. */
export async function requireVoiceSecret(req: FastifyRequest, _reply: FastifyReply) {
  const got = req.headers[VOICE_SECRET_HEADER];
  if (typeof got !== "string" || !safeEqual(got, req.server.config.VOICE_SHARED_SECRET)) {
    throw unauthorized("Missing or wrong x-agent-pledge-secret");
  }
}

/** True when the request carries the agent token (header, or ?token= for WebSocket clients). */
export function hasAgentToken(req: FastifyRequest): boolean {
  const query = req.query as Record<string, unknown> | undefined;
  const token = bearer(req) ?? (typeof query?.token === "string" ? query.token : null);
  return !!token && safeEqual(token, req.server.config.AGENT_TOKEN);
}

/** preHandler for /agent/*, /admin/*, and /ws/agent. */
export async function requireAgentToken(req: FastifyRequest, _reply: FastifyReply) {
  if (!hasAgentToken(req)) throw unauthorized("Missing or wrong agent bearer token");
}

// ---------- Helper tokens ----------

export interface HelperTokenPayload {
  /** Sub-task ID the token is bound to. */
  sid: string;
  /** Helper wallet ID. */
  wid: string;
  /** Issued at (ms). */
  iat: number;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("base64url");

export function issueHelperToken(
  cfg: Config,
  subtaskId: string,
  walletId: string,
  now = Date.now(),
): string {
  const body = b64u(
    JSON.stringify({ sid: subtaskId, wid: walletId, iat: now } satisfies HelperTokenPayload),
  );
  return `${body}.${sign(cfg.COOKIE_SECRET, `helper.${body}`)}`;
}

/** Returns the payload when the token is valid AND bound to `subtaskId`; null otherwise. */
export function verifyHelperToken(
  cfg: Config,
  token: string,
  subtaskId: string,
): HelperTokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(cfg.COOKIE_SECRET, `helper.${body}`))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HelperTokenPayload;
    return p.sid === subtaskId ? p : null;
  } catch {
    return null;
  }
}

/** Raw helper token from the signed cookie for `code`, the bearer header, or x-helper-token. */
export function getHelperToken(req: FastifyRequest, code: string): string | null {
  const header = req.headers[HELPER_TOKEN_HEADER];
  if (typeof header === "string" && header) return header;
  const b = bearer(req);
  if (b) return b;
  const raw = req.cookies?.[helperCookieName(code)];
  if (raw) {
    const u = req.unsignCookie(raw);
    if (u.valid && u.value) return u.value;
  }
  return null;
}

/** The verified helper for this sub-task, or null. */
export function helperFromRequest(
  req: FastifyRequest,
  code: string,
  subtaskId: string,
): HelperTokenPayload | null {
  const token = getHelperToken(req, code);
  return token ? verifyHelperToken(req.server.config, token, subtaskId) : null;
}

/** Like helperFromRequest but throws 401. */
export function requireHelper(
  req: FastifyRequest,
  code: string,
  subtaskId: string,
): HelperTokenPayload {
  const h = helperFromRequest(req, code, subtaskId);
  if (!h) throw unauthorized("This sub-task was not claimed from this device");
  return h;
}

/** Sets the signed helper cookie. SameSite=None; Secure when the API is https (claim page may be cross-origin). */
export function setHelperCookie(reply: FastifyReply, cfg: Config, code: string, token: string) {
  const secure = cfg.PUBLIC_API_URL.startsWith("https://");
  reply.setCookie(helperCookieName(code), token, {
    signed: true,
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
    maxAge: 60 * 60 * 24,
  });
}
