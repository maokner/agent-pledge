/**
 * Server side of the backup form (#38, PRD 11): `POST /api/backup-task`.
 *
 * The browser cannot hold the voice agent's shared secret, so it sends the
 * form here with an operator passcode. This handler checks the passcode,
 * validates the form, and makes the same `POST /tools/create_task` call as
 * the voice agent, adding the secret from a server-only env var.
 *
 * Server-only env vars (never NEXT_PUBLIC_, so Next.js never puts them in the
 * browser bundle):
 * - BACKUP_FORM_PASSCODE: what the operator types into the form. The form is
 *   off (503) until it is set, except in fixture mode.
 * - AGENT_PLEDGE_SERVER_URL: the server's base URL as this Next.js server
 *   reaches it. Falls back to NEXT_PUBLIC_API_URL if that is absolute.
 * - AGENT_PLEDGE_VOICE_SECRET: the same secret the voice agent sends.
 * - BACKUP_FORM_CALLER_PHONE: caller_phone when the form leaves it empty.
 *
 * In fixture mode (NEXT_PUBLIC_FIXTURES=1) the route answers with the fixture
 * client instead of calling a server.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import {
  VOICE_SECRET_HEADER,
  type ApiErrorCode,
  type CreateTaskRequest,
  type CreateTaskResponse,
} from "@agent-pledge/shared";
import { ApiError } from "../api/client";
import { createHttpApiClient } from "../api/http-client";
import { trimSlash } from "../config";
import { BACKUP_PASSCODE_HEADER, type BackupTaskErrorBody } from "./protocol";
import { validateBackupTask } from "./validate";

export { BACKUP_PASSCODE_HEADER };

/** A reserved fictional number (555-01xx), for tasks made without a caller. */
export const DEFAULT_CALLER_PHONE = "+15555550100";

export interface BackupTaskConfig {
  mode: "server" | "fixtures";
  passcode: string | null;
  serverUrl: string | null;
  voiceSecret: string | null;
  callerPhone: string;
}

export function readBackupTaskConfig(env: Record<string, string | undefined>): BackupTaskConfig {
  const publicApi = env.NEXT_PUBLIC_API_URL ?? "";
  const serverUrl = env.AGENT_PLEDGE_SERVER_URL || (/^https?:\/\//.test(publicApi) ? publicApi : "");
  return {
    mode: env.NEXT_PUBLIC_FIXTURES === "1" ? "fixtures" : "server",
    passcode: env.BACKUP_FORM_PASSCODE || null,
    serverUrl: serverUrl ? trimSlash(serverUrl) : null,
    voiceSecret: env.AGENT_PLEDGE_VOICE_SECRET || null,
    callerPhone: env.BACKUP_FORM_CALLER_PHONE || DEFAULT_CALLER_PHONE,
  };
}

export interface BackupTaskDeps {
  config: BackupTaskConfig;
  createTask: (request: CreateTaskRequest) => Promise<CreateTaskResponse>;
}

export async function handleBackupTask(request: Request, { config, createTask }: BackupTaskDeps): Promise<Response> {
  if (config.mode === "server") {
    const missing = [
      !config.passcode && "BACKUP_FORM_PASSCODE",
      !config.serverUrl && "AGENT_PLEDGE_SERVER_URL",
      !config.voiceSecret && "AGENT_PLEDGE_VOICE_SECRET",
    ].filter(Boolean);
    if (missing.length > 0) {
      return error(503, "internal", `The backup form is off. Set ${missing.join(", ")} on the web server.`);
    }
  }
  if (config.passcode && !samePasscode(request.headers.get(BACKUP_PASSCODE_HEADER) ?? "", config.passcode)) {
    return error(401, "unauthorized", "Wrong passcode.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "bad_request", "The form did not send JSON.");
  }
  const checked = validateBackupTask(body);
  if (!checked.ok) return error(400, "bad_request", "Some fields need fixing.", checked.errors);

  try {
    const response = await createTask({ ...checked.value, caller_phone: checked.value.caller_phone ?? config.callerPhone });
    return Response.json(response);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      return error(502, "internal", "The server rejected the voice secret. Check AGENT_PLEDGE_VOICE_SECRET.");
    }
    if (cause instanceof ApiError && cause.status < 500) return error(cause.status, cause.code, cause.message);
    console.error("backup-task: create_task failed", cause);
    const message = cause instanceof ApiError ? cause.message : "Could not reach the server.";
    return error(502, cause instanceof ApiError ? cause.code : "internal", message);
  }
}

/** create_task on the real server, with the voice secret added. */
export function createTaskSender(
  config: BackupTaskConfig,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): BackupTaskDeps["createTask"] {
  const secret = config.voiceSecret ?? "";
  const client = createHttpApiClient({
    baseUrl: config.serverUrl ?? "",
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set(VOICE_SECRET_HEADER, secret);
      return fetchImpl(input, { ...init, headers, credentials: "omit", cache: "no-store" });
    },
  });
  return (request) => client.createTask(request);
}

function samePasscode(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function error(
  status: number,
  code: ApiErrorCode,
  message: string,
  fields?: BackupTaskErrorBody["fields"],
): Response {
  const body: BackupTaskErrorBody = fields ? { error: code, message, fields } : { error: code, message };
  return Response.json(body, { status });
}
