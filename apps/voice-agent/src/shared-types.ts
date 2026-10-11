/** Voice tool contract types. Kept local to the voice agent after the shared package merge. */
export type TaskStatus = "open" | "claimed" | "done" | "failed";

/** Input to the voice agent's create_task tool. PRD section 6. */
export interface CreateTaskInput {
  description: string;
  place: string;
  time_limit_minutes: number;
  price_usd: number;
  caller_phone: string;
  /**
   * The ElevenLabs conversation id (system__conversation_id), used to dedupe retries.
   * The server returns the existing task for a repeated call_id instead of creating a new one.
   * Absent or empty when the request does not come from a call, for example from the board's web form.
   */
  call_id?: string;
}

/** Output of the voice agent's create_task tool. PRD section 6. */
export interface CreateTaskOutput {
  task_id: string;
  pin: string;
  board_url: string;
}

/** Output of the voice agent's task_status tool. PRD section 6. */
export interface TaskStatusOutput {
  status: TaskStatus;
  helper_note: string | null;
}
