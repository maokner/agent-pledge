/**
 * Sends the sample tool payloads to a server and checks the responses against the contract.
 * It works against the mock server or the real server, so the back end can use it as a contract test.
 */
import { randomBytes } from "node:crypto";
import type { CreateTaskInput, CreateTaskOutput } from "@agent-pledge/shared";
import type { z } from "zod";
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

interface ToolCall {
  status: number;
  body: unknown;
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
  const res = await fetchFn(new URL(path, baseUrl).toString(), request);
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

/** Runs the sample payloads and the negative checks. Never throws for a failed check. */
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

  const wrongSecret = await call(fetchFn, baseUrl, CREATE_TASK_PATH, {
    method: "POST",
    secret: `${secret}-wrong`,
    body: { ...SAMPLE_NORMAL_CALL, call_id: newCallId() },
  });
  results.push(
    expectShape("create_task: wrong secret is rejected", wrongSecret, 401, toolErrorSchema),
  );

  const noSecret = await call(fetchFn, baseUrl, CREATE_TASK_PATH, {
    method: "POST",
    secret: null,
    body: { ...SAMPLE_NORMAL_CALL, call_id: newCallId() },
  });
  results.push(
    expectShape("create_task: missing secret is rejected", noSecret, 401, toolErrorSchema),
  );

  const noPrice: Partial<CreateTaskInput> = { ...SAMPLE_NORMAL_CALL, call_id: newCallId() };
  delete noPrice.price_usd;
  const missingPrice = await call(fetchFn, baseUrl, CREATE_TASK_PATH, {
    method: "POST",
    secret,
    body: noPrice,
  });
  results.push(
    expectShape("create_task: missing price is rejected", missingPrice, 400, toolErrorSchema),
  );

  const unknown = await call(fetchFn, baseUrl, taskStatusPath("task_does_not_exist"), {
    method: "GET",
    secret,
  });
  results.push(expectShape("task_status: unknown task is 404", unknown, 404, toolErrorSchema));

  return results;
}
