/**
 * The HTTP contract between the ElevenLabs voice agent and the server (PRD section 6).
 * The mock server, the simulator, and the tests all validate against these schemas.
 */
import { z } from "zod";
import type {
  CreateTaskInput,
  CreateTaskOutput,
  TaskStatus,
  TaskStatusOutput,
} from "@agent-pledge/shared";

/** Header that carries the shared secret from ElevenLabs to the server. */
export const VOICE_SECRET_HEADER = "x-voice-secret";

export const CREATE_TASK_PATH = "/tools/create_task";
export const TASK_STATUS_PATH_PREFIX = "/tools/task_status/";

export function taskStatusPath(taskId: string): string {
  return `${TASK_STATUS_PATH_PREFIX}${encodeURIComponent(taskId)}`;
}

export const TASK_STATUSES = [
  "open",
  "claimed",
  "done",
  "failed",
] as const satisfies readonly TaskStatus[];

// Compile-time check that TASK_STATUSES lists every TaskStatus.
type MissingStatus = Exclude<TaskStatus, (typeof TASK_STATUSES)[number]>;
const allStatusesListed: MissingStatus extends never ? true : false = true;
void allStatusesListed;

const nonEmptyText = z.string().trim().min(1).max(500);

export const createTaskInputSchema = z
  .object({
    description: nonEmptyText,
    place: nonEmptyText,
    time_limit_minutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
    price_usd: z.number().positive().max(10_000),
    // Filled from system__caller_id. It may be empty in a call with no phone line, such as a dashboard test.
    caller_phone: z.string().max(64),
  })
  .strict() satisfies z.ZodType<CreateTaskInput>;

export const createTaskOutputSchema = z
  .object({
    task_id: z.string().min(1),
    pin: z.string().regex(/^\d{4}$/, "pin must be exactly 4 digits"),
    board_url: z.url(),
  })
  .strict() satisfies z.ZodType<CreateTaskOutput>;

export const taskStatusOutputSchema = z
  .object({
    status: z.enum(TASK_STATUSES),
    helper_note: z.string().nullable(),
  })
  .strict() satisfies z.ZodType<TaskStatusOutput>;

/** Error body returned by the server for every non-2xx tool response. */
export const toolErrorSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
  details: z.array(z.string()).optional(),
});

export type ToolError = z.infer<typeof toolErrorSchema>;

/** Turn a zod error into short, readable lines such as "price_usd: Required". */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
