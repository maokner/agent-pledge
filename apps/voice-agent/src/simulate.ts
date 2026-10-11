/**
 * Sends the sample tool payloads to a server and checks the responses against the contract.
 * It works against the mock server or the real server, so the back end can use it as a contract test.
 * The server check is the part without side effects, and `pnpm provision` runs it before any write.
 */
import { randomBytes } from "node:crypto";
import type { CreateTaskInput, CreateTaskOutput } from "@agent-pledge/shared";
import { z } from "zod";
import {
  CREATE_TASK_PATH,
  VOICE_SECRET_HEADER,
  createTaskOutputSchema,
  formatIssues,
  taskStatusOutputSchema,
  taskStatusPath,
  toolErrorSchema,
} from "./contract.js";
import { SAMPLE_NORMAL_CALL, SAMPLE_NO_PRICE_CALL } from "./samples.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** Runs the server check against a base URL. `pnpm provision` takes one, so tests and the dry run can replace it. */
export type ServerCheck = (baseUrl: string, secret: string) => Promise<CheckResult[]>;

interface ToolCall {
  status: number;
  body: unknown;
}

/** Joins like the tool templates do (`${PUBLIC_BASE_URL}/tools/...`), so a base URL with a path keeps it. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function call(
  fetchFn: FetchLike,
  baseUrl: string,
  path: string,
  init: { method: "GET" | "POST"; secret: string | null; body?: unknown },
): Promise<ToolCall> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.secret !== null) headers[VOICE_SECRET_HEADER] = init.secret;
  const request: RequestInit = { method: init.method, headers };
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    request.body = JSON.stringify(init.body);
  }
  const res = await fetchFn(joinUrl(baseUrl, path), request);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // Keep the raw text; the check that reads it reports the problem.
  }
  return { status: res.status, body };
}

function expectShape(
  name: string,
  result: ToolCall,
  status: number,
  schema: z.ZodType,
): CheckResult {
  if (result.status !== status) {
    return {
      name,
      ok: false,
      detail: `expected HTTP ${status}, got ${result.status}: ${JSON.stringify(result.body)}`,
    };
  }
  const parsed = schema.safeParse(result.body);
  if (!parsed.success) {
    const issues = formatIssues(parsed.error).join("; ");
    return { name, ok: false, detail: `bad body ${JSON.stringify(result.body)}: ${issues}` };
  }
  return { name, ok: true, detail: JSON.stringify(result.body) };
}

const RETRY_CHECK = "create_task: a retry with the same call_id returns the same task";

/** The retry must return the first task (same task_id and pin), and the other call's task must be a different one. */
function sameTaskCheck(
  retry: ToolCall,
  first: CreateTaskOutput | null,
  other: CreateTaskOutput | null,
): CheckResult {
  const shape = expectShape(RETRY_CHECK, retry, 200, createTaskOutputSchema);
  if (!shape.ok) return shape;
  if (!first) return { name: RETRY_CHECK, ok: false, detail: "skipped, the first call failed" };
  const again = createTaskOutputSchema.parse(retry.body);
  if (again.task_id !== first.task_id || again.pin !== first.pin) {
    return {
      name: RETRY_CHECK,
      ok: false,
      detail: `expected task_id ${first.task_id} and pin ${first.pin} again, got ${shape.detail}`,
    };
  }
  if (other && other.task_id === first.task_id) {
    return {
      name: RETRY_CHECK,
      ok: false,
      detail: `two calls with different call_id values got the same task ${first.task_id}`,
    };
  }
  return shape;
}

/** A body that the server must reject with 400 if the secret is right, so no check creates a task. */
function bodyWithoutPrice(): Partial<CreateTaskInput> {
  const body: Partial<CreateTaskInput> = { ...SAMPLE_NORMAL_CALL, call_id: "conv_server_check" };
  delete body.price_usd;
  return body;
}

type SecretUse = "right" | "wrong" | "none";

interface ServerCheckStep {
  name: string;
  method: "GET" | "POST";
  path: string;
  secret: SecretUse;
  body?: () => unknown;
  status: number;
  schema: z.ZodType;
}

/**
 * Checks without side effects: none of them can create a task, even on a server that ignores the secret.
 * Together they prove that the server is up, rejects a wrong or missing secret, and accepts the right one.
 */
const SERVER_CHECK_STEPS: readonly ServerCheckStep[] = [
  {
    name: "server: GET /health answers 200",
    method: "GET",
    path: "/health",
    secret: "none",
    status: 200,
    schema: z.unknown(),
  },
  {
    name: "create_task: wrong secret is rejected",
    method: "POST",
    path: CREATE_TASK_PATH,
    secret: "wrong",
    body: bodyWithoutPrice,
    status: 401,
    schema: toolErrorSchema,
  },
  {
    name: "create_task: missing secret is rejected",
    method: "POST",
    path: CREATE_TASK_PATH,
    secret: "none",
    body: bodyWithoutPrice,
    status: 401,
    schema: toolErrorSchema,
  },
  {
    name: "create_task: missing price is rejected",
    method: "POST",
    path: CREATE_TASK_PATH,
    secret: "right",
    body: bodyWithoutPrice,
    status: 400,
    schema: toolErrorSchema,
  },
  {
    name: "task_status: unknown task is 404",
    method: "GET",
    path: taskStatusPath("task_does_not_exist"),
    secret: "right",
    status: 404,
    schema: toolErrorSchema,
  },
];

const SECRET_LABELS: Record<SecretUse, string> = {
  right: "with VOICE_TOOL_SECRET",
  wrong: "with a wrong secret",
  none: "with no secret",
};

/** One line for each server check, for the dry run. */
export function describeServerCheck(baseUrl: string): string[] {
  return SERVER_CHECK_STEPS.map(
    (step) =>
      `${step.method} ${joinUrl(baseUrl, step.path)} ${SECRET_LABELS[step.secret]}: expect HTTP ${step.status}`,
  );
}

/** A short reason for a failed fetch, for example "ECONNREFUSED 127.0.0.1:8791" instead of "fetch failed". */
export function networkReason(err: unknown): string {
  let e: unknown = err;
  while (e instanceof Error && e.cause !== undefined) e = e.cause;
  if (e instanceof AggregateError && e.errors.length > 0) e = e.errors[0];
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return typeof code === "string" && !e.message.includes(code)
      ? `${code} ${e.message}`
      : e.message;
  }
  return String(e);
}

export interface ServerCheckOptions {
  baseUrl: string;
  secret: string;
  fetchFn?: FetchLike;
}

/** Runs the checks without side effects. A network error fails the check instead of throwing. */
export async function runServerCheck(options: ServerCheckOptions): Promise<CheckResult[]> {
  const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
  const results: CheckResult[] = [];
  for (const step of SERVER_CHECK_STEPS) {
    const secret =
      step.secret === "right"
        ? options.secret
        : step.secret === "wrong"
          ? `${options.secret}-wrong`
          : null;
    try {
      const res = await call(fetchFn, options.baseUrl, step.path, {
        method: step.method,
        secret,
        ...(step.body ? { body: step.body() } : {}),
      });
      results.push(expectShape(step.name, res, step.status, step.schema));
    } catch (err) {
      results.push({ name: step.name, ok: false, detail: `no answer: ${networkReason(err)}` });
    }
  }
  return results;
}

export interface SimulationOptions {
  baseUrl: string;
  secret: string;
  fetchFn?: FetchLike;
  /**
   * Makes the call_id for each simulated call.
   * The default is unique per run, so a second run against the real server creates new tasks instead of getting old ones.
   */
  newCallId?: () => string;
}

export function randomCallId(): string {
  return `conv_simulate_${randomBytes(6).toString("hex")}`;
}

/** Runs the sample payloads, then the server check. Never throws for a failed check. */
export async function runSimulation(options: SimulationOptions): Promise<CheckResult[]> {
  const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
  const { baseUrl, secret } = options;
  const newCallId = options.newCallId ?? randomCallId;
  const results: CheckResult[] = [];

  const createTask = async (
    name: string,
    input: CreateTaskInput,
  ): Promise<CreateTaskOutput | null> => {
    const res = await call(fetchFn, baseUrl, CREATE_TASK_PATH, {
      method: "POST",
      secret,
      body: input,
    });
    const check = expectShape(name, res, 200, createTaskOutputSchema);
    results.push(check);
    const parsed = createTaskOutputSchema.safeParse(res.body);
    return check.ok && parsed.success ? parsed.data : null;
  };

  const normalCall: CreateTaskInput = { ...SAMPLE_NORMAL_CALL, call_id: newCallId() };
  const first = await createTask("create_task: normal call (transcript 01)", normalCall);
  const second = await createTask("create_task: price asked for (transcript 02)", {
    ...SAMPLE_NO_PRICE_CALL,
    call_id: newCallId(),
  });

  // Transcript 04: a retry after a timeout sends the same call_id and must get the same task, not a second one.
  const retry = await call(fetchFn, baseUrl, CREATE_TASK_PATH, {
    method: "POST",
    secret,
    body: normalCall,
  });
  results.push(sameTaskCheck(retry, first, second));

  if (first) {
    const res = await call(fetchFn, baseUrl, taskStatusPath(first.task_id), {
      method: "GET",
      secret,
    });
    results.push(
      expectShape("task_status: task from the normal call", res, 200, taskStatusOutputSchema),
    );
  } else {
    results.push({
      name: "task_status: task from the normal call",
      ok: false,
      detail: "skipped, no task_id",
    });
  }

  results.push(...(await runServerCheck({ baseUrl, secret, fetchFn })));

  return results;
}
