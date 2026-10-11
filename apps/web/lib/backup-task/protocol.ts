/** What the backup form's browser code and its route handler agree on (#38). Safe to import anywhere. */
import type { ApiErrorBody } from "@/lib/contract";
import type { BackupTaskField } from "./validate";

/** The route: this web app's proxy to the server's create_task. */
export const BACKUP_TASK_ROUTE = "/api/backup-task";

/** The browser sends the operator passcode in this header. */
export const BACKUP_PASSCODE_HEADER = "x-backup-passcode";

/** Errors from the route: the contract's error body, plus per-field messages for a bad form. */
export interface BackupTaskErrorBody extends ApiErrorBody {
  fields?: Partial<Record<BackupTaskField, string>>;
}
