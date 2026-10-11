/** Browser side of the backup form (#38): posts to this web app's /api/backup-task route. */
import type { ApiErrorCode, CreateTaskResponse } from "@agent-pledge/shared";
import { ApiError } from "../api/client";
import { BACKUP_PASSCODE_HEADER, BACKUP_TASK_ROUTE, type BackupTaskErrorBody } from "./protocol";
import type { BackupTaskField } from "./validate";

export class BackupTaskError extends ApiError {
  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    readonly fields: Partial<Record<BackupTaskField, string>> = {},
  ) {
    super(status, code, message);
    this.name = "BackupTaskError";
  }
}

/** The form's raw values; the route validates them again. */
export type BackupTaskForm = Record<BackupTaskField, string>;

export async function submitBackupTask(
  form: BackupTaskForm,
  passcode: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CreateTaskResponse> {
  const response = await fetchImpl(BACKUP_TASK_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json", [BACKUP_PASSCODE_HEADER]: passcode },
    body: JSON.stringify(form),
  });
  if (response.ok) return (await response.json()) as CreateTaskResponse;
  let body: Partial<BackupTaskErrorBody> = {};
  try {
    body = (await response.json()) as Partial<BackupTaskErrorBody>;
  } catch {
    // Not JSON; fall through.
  }
  throw new BackupTaskError(
    response.status,
    body.error ?? "internal",
    body.message ?? `Server error (${response.status})`,
    body.fields,
  );
}
