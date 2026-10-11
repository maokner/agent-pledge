/**
 * The ApiClient for the real server (origin/backend-all, docs/api.md). It
 * speaks the server's shapes on the wire and returns the web app's own types,
 * mapping everything through lib/backend.
 */
import { apiPaths, HELPER_TOKEN_HEADER, type ClaimCode, type ClaimView, type SubmitPinRequest } from "@/lib/contract";
import {
  apiErrorFromBackend,
  attemptsLeftFrom,
  boardSnapshotFromBackend,
  claimViewFromBackend,
  createHelperTokenStore,
  createTaskResponseFromBackend,
  openSubtasksFromBackend,
  subtasksOf,
  taskNftDataFromBackend,
  type ErrorContext,
  type HelperTokenStore,
} from "../backend";
import type {
  BackendBoardState,
  BackendClaimSubtaskResponse,
  BackendClaimView,
  BackendCreateTaskResponse,
  BackendNftUriData,
  BackendPhotoResponse,
  BackendPinResponse,
} from "../backend/types";
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
  /** Where helper tokens live. Defaults to localStorage. */
  tokens?: HelperTokenStore;
  /** Epoch ms. The server sends no clock, so claim views carry this one. */
  now?: () => number;
}

interface RequestOptions extends ErrorContext {
  body?: unknown;
  headers?: Record<string, string>;
}

export function createHttpApiClient({
  baseUrl,
  fetch = globalThis.fetch,
  xhr = typeof XMLHttpRequest === "undefined" ? undefined : () => new XMLHttpRequest(),
  tokens = createHelperTokenStore(),
  now = Date.now,
}: HttpApiClientOptions): ApiClient {
  async function request<T>(method: "GET" | "POST", path: string, { body, headers, helper }: RequestOptions = {}): Promise<T> {
    // No timeout: the right PIN is answered only after the payout is on the ledger, which can take a while.
    const init: RequestInit = { method, credentials: "include", headers: { ...headers } };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { ...headers, "content-type": "application/json" };
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) throw apiErrorFromBackend(response.status, await response.text().catch(() => ""), { helper });
    return (await response.json()) as T;
  }

  /** The helper token for this code, as the header the server reads. */
  function helperHeaders(code: ClaimCode): Record<string, string> {
    const token = tokens.get(code);
    return token ? { [HELPER_TOKEN_HEADER]: token } : {};
  }

  const getRawClaim = (code: ClaimCode) => request<BackendClaimView>("GET", apiPaths.claim(code), { headers: helperHeaders(code) });

  /**
   * The claim view has no time limit, so it comes from the sub-task on the
   * board, once per sub-task. Null (use the minutes left) if the board does not load.
   */
  const timeLimits = new Map<string, Promise<number | null>>();
  function timeLimitFor(subtaskId: string): Promise<number | null> {
    let limit = timeLimits.get(subtaskId);
    if (!limit) {
      limit = request<BackendBoardState>("GET", apiPaths.boardState()).then(
        (state) => state.tasks.flatMap(subtasksOf).find((sub) => sub.id === subtaskId)?.time_limit_minutes ?? null,
        () => {
          timeLimits.delete(subtaskId);
          return null;
        },
      );
      timeLimits.set(subtaskId, limit);
    }
    return limit;
  }

  async function toClaimView(view: BackendClaimView): Promise<ClaimView> {
    return claimViewFromBackend(view, { now: now(), timeLimitMinutes: await timeLimitFor(view.subtask_id) });
  }

  return {
    getBoardState: async () => boardSnapshotFromBackend(await request<BackendBoardState>("GET", apiPaths.boardState())),
    getTaskJson: async (id) => taskNftDataFromBackend(await request<BackendNftUriData>("GET", apiPaths.taskJson(id))),
    createTask: async (body) =>
      createTaskResponseFromBackend(await request<BackendCreateTaskResponse>("POST", apiPaths.createTask(), { body })),

    getClaim: async (code) => toClaimView(await getRawClaim(code)),

    async claimSubtask(code) {
      // The server answers 409 even to the phone that already holds the claim, so look first.
      const current = await getRawClaim(code);
      if (current.claimed_by_you) return toClaimView(current);
      const { helper_token, claim } = await request<BackendClaimSubtaskResponse>("POST", apiPaths.claimSubtask(code));
      tokens.set(code, helper_token);
      return toClaimView(claim);
    },

    async uploadPhoto(code, photo, note, options) {
      const form = new FormData();
      form.set("file", photo, photo instanceof File ? photo.name : "seat-photo.jpg");
      form.set("note", note);
      const path = apiPaths.claimPhoto(code);
      const headers = helperHeaders(code);
      const response = xhr
        ? await send<BackendPhotoResponse>(xhr(), `${baseUrl}${path}`, form, headers, options)
        : await request<BackendPhotoResponse>("POST", path, { body: form, headers, helper: true });
      return toClaimView(response.claim);
    },

    async submitPin(code, pin) {
      try {
        const { claim } = await request<BackendPinResponse>("POST", apiPaths.claimPin(code), {
          body: { pin } satisfies SubmitPinRequest,
          headers: helperHeaders(code),
          helper: true,
        });
        return { result: "correct", claim: await toClaimView(claim) };
      } catch (error) {
        if (!(error instanceof ApiError) || (error.code !== "wrong_pin" && error.code !== "locked")) throw error;
        // A wrong PIN is an error response with no claim in it: reload the claim to show it.
        const fresh = await getRawClaim(code).then(toClaimView, () => null);
        if (!fresh) throw error;
        if (error.code === "locked") return { result: "locked", claim: { ...fresh, state: "locked", pin_attempts_left: 0 } };
        return { result: "wrong", claim: { ...fresh, pin_attempts_left: attemptsLeftFrom(error) ?? fresh.pin_attempts_left } };
      }
    },

    listOpenSubtasks: async () => openSubtasksFromBackend(await request<BackendBoardState>("GET", apiPaths.boardState())),
  };
}

/** Long enough for a resized photo on a weak phone signal; the page offers a retry after. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** POSTs a form with XMLHttpRequest, reporting upload progress. Fails like fetch: TypeError offline, AbortError on abort. */
function send<T>(
  req: XMLHttpRequest,
  url: string,
  body: FormData,
  headers: Record<string, string>,
  { onProgress, signal }: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => req.abort();
    const done = () => signal?.removeEventListener("abort", abort);
    req.open("POST", url);
    for (const [name, value] of Object.entries(headers)) req.setRequestHeader(name, value);
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
        reject(apiErrorFromBackend(req.status, req.responseText, { helper: true }));
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
