import {
  apiPaths,
  type ApiErrorBody,
  type BoardSnapshot,
  type ClaimView,
  type CreateTaskResponse,
  type SubmitPinRequest,
  type SubmitPinResponse,
  type TaskNftData,
} from "@agent-pledge/shared";
import { ApiError, type ApiClient } from "./client";

export interface HttpApiClientOptions {
  /** Server base URL; "" for same origin. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export function createHttpApiClient({ baseUrl, fetch = globalThis.fetch }: HttpApiClientOptions): ApiClient {
  async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, credentials: "include" };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { "content-type": "application/json" };
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) throw await toApiError(response);
    return (await response.json()) as T;
  }

  return {
    getBoardState: () => request<BoardSnapshot>("GET", apiPaths.boardState()),
    getTaskJson: (id) => request<TaskNftData>("GET", apiPaths.taskJson(id)),
    createTask: (body) => request<CreateTaskResponse>("POST", apiPaths.createTask(), body),
    getClaim: (code) => request<ClaimView>("GET", apiPaths.claim(code)),
    claimSubtask: (code) => request<ClaimView>("POST", apiPaths.claimSubtask(code)),
    uploadPhoto: (code, photo, note) => {
      const form = new FormData();
      form.set("photo", photo);
      form.set("note", note);
      return request<ClaimView>("POST", apiPaths.claimPhoto(code), form);
    },
    submitPin: (code, pin) =>
      request<SubmitPinResponse>("POST", apiPaths.claimPin(code), { pin } satisfies SubmitPinRequest),
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (typeof body.error === "string") {
      return new ApiError(response.status, body.error, body.message ?? body.error);
    }
  } catch {
    // Not JSON; fall through.
  }
  return new ApiError(response.status, "internal", `Server error (${response.status})`);
}
