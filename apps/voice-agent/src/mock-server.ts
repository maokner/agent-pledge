/**
 * A stand-in for the real server's voice-agent tool endpoints (PRD section 6, issue 14).
 * handleRequest is a pure request-to-response function, so the tests need no network.
 * createMockHttpServer wraps it in a node:http server for manual and end-to-end tests.
 */
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { CreateTaskInput, CreateTaskOutput, TaskStatusOutput } from "@agent-pledge/shared";
import {
  CREATE_TASK_PATH,
  TASK_STATUS_PATH_PREFIX,
  TASK_STATUSES,
  VOICE_SECRET_HEADER,
  createTaskInputSchema,
  formatIssues,
  type ToolError,
} from "./contract.js";
import { z } from "zod";

export const MAX_BODY_BYTES = 16 * 1024;

/** Which tool endpoints answer with a 503, to rehearse the error path of the conversation. */
export type FailMode = "none" | "create_task" | "task_status" | "all";

export const FAIL_MODES = [
  "none",
  "create_task",
  "task_status",
  "all",
] as const satisfies readonly FailMode[];

export interface MockTask {
  task_id: string;
  pin: string;
  input: CreateTaskInput;
  status: TaskStatusOutput["status"];
  helper_note: string | null;
  created_at: string;
}

export interface MockContext {
  /** The expected value of the x-voice-secret header. */
  secret: string;
  /** Returned as board_url for every task. */
  boardUrl: string;
  failMode: FailMode;
  tasks: Map<string, MockTask>;
  newPin: () => string;
  newTaskId: () => string;
  now: () => Date;
}

export interface MockRequest {
  method: string;
  /** Path plus optional query string, as in IncomingMessage.url. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

export function randomPin(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

export function randomTaskId(): string {
  return `task_${randomBytes(6).toString("hex")}`;
}

export function createMockContext(
  options: Pick<MockContext, "secret" | "boardUrl"> & Partial<MockContext>,
): MockContext {
  return {
    failMode: "none",
    tasks: new Map(),
    newPin: randomPin,
    newTaskId: randomTaskId,
    now: () => new Date(),
    ...options,
  };
}

function error(status: number, code: string, message: string, details?: string[]): MockResponse {
  const body: ToolError = details ? { error: code, message, details } : { error: code, message };
  return { status, body };
}

function secretMatches(header: string | string[] | undefined, expected: string): boolean {
  if (typeof header !== "string") return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}

const mockStatusUpdateSchema = z
  .object({
    status: z.enum(TASK_STATUSES),
    helper_note: z.string().nullable().optional(),
  })
  .strict();

function createTask(req: MockRequest, ctx: MockContext): MockResponse {
  if (ctx.failMode === "create_task" || ctx.failMode === "all") {
    return error(503, "unavailable", "The mock server is set to fail create_task.");
  }
  const json = parseJson(req.body);
  if (!json.ok) return error(400, "invalid_json", "The request body is not valid JSON.");
  const parsed = createTaskInputSchema.safeParse(json.value);
  if (!parsed.success) {
    return error(400, "invalid_input", "The task input is not valid.", formatIssues(parsed.error));
  }
  let taskId = ctx.newTaskId();
  while (ctx.tasks.has(taskId)) taskId = ctx.newTaskId();
  const task: MockTask = {
    task_id: taskId,
    pin: ctx.newPin(),
    input: parsed.data,
    status: "open",
    helper_note: null,
    created_at: ctx.now().toISOString(),
  };
  ctx.tasks.set(taskId, task);
  const body: CreateTaskOutput = { task_id: task.task_id, pin: task.pin, board_url: ctx.boardUrl };
  return { status: 200, body };
}

function taskStatus(taskId: string, ctx: MockContext): MockResponse {
  if (ctx.failMode === "task_status" || ctx.failMode === "all") {
    return error(503, "unavailable", "The mock server is set to fail task_status.");
  }
  const task = ctx.tasks.get(taskId);
  if (!task) return error(404, "not_found", `No task with id ${taskId}.`);
  const body: TaskStatusOutput = { status: task.status, helper_note: task.helper_note };
  return { status: 200, body };
}

/** Mock-only: move a task to another status, to rehearse task_status answers. */
function setMockStatus(taskId: string, req: MockRequest, ctx: MockContext): MockResponse {
  const task = ctx.tasks.get(taskId);
  if (!task) return error(404, "not_found", `No task with id ${taskId}.`);
  const json = parseJson(req.body);
  if (!json.ok) return error(400, "invalid_json", "The request body is not valid JSON.");
  const parsed = mockStatusUpdateSchema.safeParse(json.value);
  if (!parsed.success) {
    return error(
      400,
      "invalid_input",
      "The status update is not valid.",
      formatIssues(parsed.error),
    );
  }
  task.status = parsed.data.status;
  if (parsed.data.helper_note !== undefined) task.helper_note = parsed.data.helper_note;
  return { status: 200, body: task };
}

function decodeId(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw);
    return id.length > 0 && !id.includes("/") ? id : null;
  } catch {
    return null;
  }
}

export function handleRequest(req: MockRequest, ctx: MockContext): MockResponse {
  const path = new URL(req.url, "http://mock.invalid").pathname;
  const method = req.method.toUpperCase();

  if (path === "/health") {
    return method === "GET"
      ? { status: 200, body: { ok: true, fail_mode: ctx.failMode } }
      : error(405, "method_not_allowed", "Use GET.");
  }

  const isToolRoute = path === CREATE_TASK_PATH || path.startsWith(TASK_STATUS_PATH_PREFIX);
  const isMockRoute = path === "/mock/tasks" || path.startsWith("/mock/tasks/");
  if (!isToolRoute && !isMockRoute) return error(404, "not_found", `No route for ${path}.`);

  if (!secretMatches(req.headers[VOICE_SECRET_HEADER], ctx.secret)) {
    return error(401, "unauthorized", `Missing or wrong ${VOICE_SECRET_HEADER} header.`);
  }

  if (path === CREATE_TASK_PATH) {
    return method === "POST" ? createTask(req, ctx) : error(405, "method_not_allowed", "Use POST.");
  }

  if (path.startsWith(TASK_STATUS_PATH_PREFIX)) {
    const id = decodeId(path.slice(TASK_STATUS_PATH_PREFIX.length));
    if (!id) return error(404, "not_found", "Missing task id.");
    return method === "GET" ? taskStatus(id, ctx) : error(405, "method_not_allowed", "Use GET.");
  }

  if (path === "/mock/tasks") {
    return method === "GET"
      ? { status: 200, body: [...ctx.tasks.values()] }
      : error(405, "method_not_allowed", "Use GET.");
  }

  const id = decodeId(path.slice("/mock/tasks/".length));
  if (!id) return error(404, "not_found", "Missing task id.");
  return method === "POST"
    ? setMockStatus(id, req, ctx)
    : error(405, "method_not_allowed", "Use POST.");
}

class BodyTooLargeError extends Error {}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface MockServerLogEntry {
  method: string;
  url: string;
  status: number;
  requestBody: string;
  responseBody: unknown;
}

export function createMockHttpServer(
  ctx: MockContext,
  onRequest: (entry: MockServerLogEntry) => void = () => {},
): Server {
  return createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    readBody(req)
      .then((body) => ({
        body,
        response: handleRequest({ method, url, headers: req.headers, body }, ctx),
      }))
      .catch((err: unknown) => ({
        body: "",
        response:
          err instanceof BodyTooLargeError
            ? error(413, "too_large", `The body is larger than ${MAX_BODY_BYTES} bytes.`)
            : error(500, "internal", "The mock server could not read the request."),
      }))
      .then(({ body, response }) => {
        onRequest({
          method,
          url,
          status: response.status,
          requestBody: body,
          responseBody: response.body,
        });
        res.writeHead(response.status, { "content-type": "application/json" });
        res.end(JSON.stringify(response.body));
      });
  });
}
