import { ErrorCode, type ApiError } from "@agent-pledge/shared";
import type { FastifyReply } from "fastify";
import type { z } from "zod";

/** Throw from a route; the app's error handler turns it into { error, message, details }. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, ErrorCode.notFound, what);
export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, ErrorCode.badRequest, message, details);

/** Validates with a zod schema from @agent-pledge/shared; throws a 400 HttpError on failure. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw badRequest(
      "Invalid request",
      r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return r.data;
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiError = { error: code, message, ...(details === undefined ? {} : { details }) };
  return reply.code(status).send(body);
}

/** For the 501 stubs. */
export function notImplemented(reply: FastifyReply, what: string) {
  return sendError(reply, 501, ErrorCode.notImplemented, `${what} is not implemented yet`);
}
