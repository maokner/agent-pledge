/**
 * POST /api/backup-task: the backup form's proxy to the server's
 * create_task (#38). The voice secret stays on this server. See
 * lib/backup-task/handler.ts for the env vars and the rules.
 */
import { createFixtureApiClient } from "@/lib/api/fixture-client";
import {
  createTaskSender,
  handleBackupTask,
  readBackupTaskConfig,
} from "@/lib/backup-task/handler";

export async function POST(request: Request): Promise<Response> {
  const config = readBackupTaskConfig(process.env);
  const createTask =
    config.mode === "fixtures" ? createFixtureApiClient().createTask : createTaskSender(config);
  return handleBackupTask(request, { config, createTask });
}
