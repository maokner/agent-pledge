import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AgentLogLevel,
  AgentLogResponse,
  ClaimTaskRequest,
  ClaimTaskResponse,
  CreateSubtaskRequest,
  CreateSubtaskResponse,
  RedeemTaskRequest,
  RedeemTaskResponse,
  ScreenshotResponse,
  TaskView,
} from "@agent-pledge/shared";

/** A non-2xx answer from the server. `code` is the ApiError `error` field (e.g. "already_claimed"). */
export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

export interface LogInput {
  message: string;
  task_id?: string | null;
  subtask_id?: string | null;
  level?: AgentLogLevel;
}

/** HTTP client for the local-agent endpoints in docs/api.md section 3.2. */
export class ServerApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(method: string, route: string, body?: unknown | FormData): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}` };
    let payload: string | FormData | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${this.baseUrl}${route}`, { method, headers, body: payload });
    const text = await res.text();
    const json: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const err = (json ?? {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiCallError(
        res.status,
        err.error ?? "http_error",
        `${method} ${route} -> ${res.status} ${err.error ?? ""}: ${err.message ?? text}`.trim(),
        err.details,
      );
    }
    return json as T;
  }

  claimTask(taskId: string, body: ClaimTaskRequest = {}): Promise<ClaimTaskResponse> {
    return this.request("POST", `/agent/tasks/${encodeURIComponent(taskId)}/claim`, body);
  }

  createSubtask(taskId: string, body: CreateSubtaskRequest): Promise<CreateSubtaskResponse> {
    return this.request("POST", `/agent/tasks/${encodeURIComponent(taskId)}/subtasks`, body);
  }

  getTask(taskId: string): Promise<TaskView> {
    return this.request("GET", `/agent/tasks/${encodeURIComponent(taskId)}`);
  }

  redeemTask(taskId: string, body: RedeemTaskRequest = {}): Promise<RedeemTaskResponse> {
    return this.request("POST", `/agent/tasks/${encodeURIComponent(taskId)}/redeem`, body);
  }

  async uploadScreenshot(
    subtaskId: string,
    filePath: string,
    postText: string,
    postedAt: string,
  ): Promise<ScreenshotResponse> {
    const bytes = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : "image/png";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), path.basename(filePath));
    form.append("post_text", postText);
    form.append("posted_at", postedAt);
    return this.request(
      "POST",
      `/agent/subtasks/${encodeURIComponent(subtaskId)}/screenshot`,
      form,
    );
  }

  log(input: LogInput): Promise<AgentLogResponse> {
    return this.request("POST", "/agent/log", { level: "info", ...input });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
