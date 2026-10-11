/**
 * The real server's error bodies (`{error, message, details?}`) as the web
 * app's ApiError, with its codes where they differ.
 */
import type { ApiErrorCode } from "@/lib/contract";
import { ApiError } from "../api/client";
import type { BackendApiError, BackendPinErrorDetails } from "./types";

export interface ErrorContext {
  /**
   * A claim-page call that needs the helper token. There a 401 means this
   * phone does not hold the claim (no token, or a token for another sub-task).
   */
  helper?: boolean;
}

/** An HTTP error response (status and raw body) as an ApiError. */
export function apiErrorFromBackend(
  status: number,
  text: string,
  { helper = false }: ErrorContext = {},
): ApiError {
  const body = parse(text);
  if (!body) return new ApiError(status, "internal", `Server error (${status})`);
  return new ApiError(
    status,
    errorCode(status, body.error, helper),
    body.message || body.error,
    body.details,
  );
}

/** `details.attempts_left` from a 422 wrong_pin or 423 pin_locked, or null. */
export function attemptsLeftFrom(error: ApiError): number | null {
  const details = error.details as Partial<BackendPinErrorDetails> | undefined;
  return typeof details?.attempts_left === "number" ? details.attempts_left : null;
}

function errorCode(status: number, code: string, helper: boolean): ApiErrorCode {
  if (helper && status === 401) return "not_your_claim";
  if (code === "pin_locked") return "locked";
  // Any other code passes through; the page treats codes it does not know as "try again".
  return code as ApiErrorCode;
}

function parse(text: string): BackendApiError | null {
  try {
    const body = JSON.parse(text) as Partial<BackendApiError> | null;
    if (body && typeof body.error === "string")
      return { error: body.error, message: body.message ?? "", details: body.details };
  } catch {
    // Not JSON.
  }
  return null;
}
