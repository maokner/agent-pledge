/**
 * The API the board and claim page use. Two implementations:
 * http-client.ts (the real server) and fixture-client.ts (fixture mode).
 * Use getApiClient() from ./index to get the right one.
 */
import type {
  ApiErrorCode,
  BoardSnapshot,
  ClaimCode,
  ClaimView,
  CreateTaskRequest,
  CreateTaskResponse,
  SubmitPinResponse,
  SubtaskId,
  TaskId,
  TaskNftData,
} from "@agent-pledge/shared";

export interface ApiClient {
  /** GET /board/state */
  getBoardState(): Promise<BoardSnapshot>;
  /** GET /tasks/:id.json */
  getTaskJson(id: TaskId | SubtaskId): Promise<TaskNftData>;
  /** POST /tools/create_task, for the backup form on the board (#38). See CONTRACT.md on auth. */
  createTask(request: CreateTaskRequest): Promise<CreateTaskResponse>;

  /** GET /claim/:code */
  getClaim(code: ClaimCode): Promise<ClaimView>;
  /** POST /claim/:code/claim. Throws ApiError "already_claimed" if another phone won. */
  claimSubtask(code: ClaimCode): Promise<ClaimView>;
  /** POST /claim/:code/photo (multipart). Reports upload progress; aborts with an "AbortError". */
  uploadPhoto(code: ClaimCode, photo: Blob, note: string, options?: UploadOptions): Promise<ClaimView>;
  /** POST /claim/:code/pin */
  submitPin(code: ClaimCode, pin: string): Promise<SubmitPinResponse>;
}

export interface UploadOptions {
  /** Called with the fraction sent so far, from 0 to 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** A non-2xx response, with the contract's error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A message safe to show a person for any error from an ApiClient call. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}
