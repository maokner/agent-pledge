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
import { ApiError, type ApiClient, type UploadOptions } from "./client";

export interface HttpApiClientOptions {
  /** Server base URL; "" for same origin. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  /**
   * Makes the request for photo uploads, which need upload progress (fetch has none).
   * Defaults to XMLHttpRequest in a browser; without one, uploads use fetch.
   */
  xhr?: () => XMLHttpRequest;
}

export function createHttpApiClient({
  baseUrl,
  fetch = globalThis.fetch,
  xhr = typeof XMLHttpRequest === "undefined" ? undefined : () => new XMLHttpRequest(),
}: HttpApiClientOptions): ApiClient {
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
    uploadPhoto: (code, photo, note, options) => {
      const form = new FormData();
      form.set("photo", photo);
      form.set("note", note);
      const path = apiPaths.claimPhoto(code);
      if (!xhr) return request<ClaimView>("POST", path, form);
      return send<ClaimView>(xhr(), `${baseUrl}${path}`, form, options);
    },
    submitPin: (code, pin) =>
      request<SubmitPinResponse>("POST", apiPaths.claimPin(code), { pin } satisfies SubmitPinRequest),
  };
}

/** Long enough for a resized photo on a weak phone signal; the page offers a retry after. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** POSTs a form with XMLHttpRequest, reporting upload progress. Fails like fetch: TypeError offline, AbortError on abort. */
function send<T>(req: XMLHttpRequest, url: string, body: FormData, { onProgress, signal }: UploadOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => req.abort();
    const done = () => signal?.removeEventListener("abort", abort);
    req.open("POST", url);
    req.withCredentials = true;
    req.timeout = UPLOAD_TIMEOUT_MS;
    req.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    });
    req.addEventListener("load", () => {
      done();
      if (req.status >= 200 && req.status < 300) {
        onProgress?.(1);
        try {
          resolve(JSON.parse(req.responseText) as T);
        } catch {
          reject(new ApiError(req.status, "internal", "The server sent a reply this page cannot read."));
        }
      } else {
        reject(parseApiError(req.status, req.responseText));
      }
    });
    req.addEventListener("error", () => {
      done();
      reject(new TypeError("Network request failed"));
    });
    req.addEventListener("timeout", () => {
      done();
      reject(new TypeError("Network request timed out"));
    });
    req.addEventListener("abort", () => {
      done();
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    });
    if (signal?.aborted) return reject(new DOMException("The upload was cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    req.send(body);
  });
}

async function toApiError(response: Response): Promise<ApiError> {
  return parseApiError(response.status, await response.text().catch(() => ""));
}

function parseApiError(status: number, text: string): ApiError {
  try {
    const body = JSON.parse(text) as Partial<ApiErrorBody>;
    if (typeof body.error === "string") {
      return new ApiError(status, body.error, body.message ?? body.error);
    }
  } catch {
    // Not JSON; fall through.
  }
  return new ApiError(status, "internal", `Server error (${status})`);
}
