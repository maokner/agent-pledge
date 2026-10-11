import { fromCents, subtaskPriceCents, toCents, type AgentTask } from "@agent-pledge/shared";
import type { AgentTools, TaskContext } from "./tools";

/**
 * AGENT_MODE=scripted: the same steps as the LLM agent, run deterministically without a model.
 * Used in tests, when no ANTHROPIC_API_KEY is set, and as the demo fallback when the LLM run fails.
 * Every step is skipped when it is already done, so it can finish a run the LLM started.
 */
export async function runScripted(tools: AgentTools, ctx: TaskContext): Promise<void> {
  const task = ctx.task;
  if (!ctx.claimed) await tools.claimTask({ task_id: task.id });
  if (!ctx.subtask) {
    const cents = subtaskPriceCents(toCents(task.price)) || toCents(task.price);
    await tools.createSubtask({
      task_id: task.id,
      price: fromCents(cents),
      reason: "Policy: 80% of the task price, rounded down to the nearest 0.50",
    });
  }
  if (!ctx.post && ctx.subtask) {
    await tools.postYikyak({
      subtask_id: ctx.subtask.id,
      text: scriptedPostText(task, ctx.subtask),
    });
  }
}

function dollars(price: string): string {
  return price.endsWith(".00") ? `$${price.slice(0, -3)}` : `$${price}`;
}

/** "Save me a seat at the front table" -> "save a seat at the front table". */
function helperPhrase(description: string): string {
  const d = description.trim().replace(/[.!]+$/, "");
  const lowered = d.charAt(0).toLowerCase() + d.slice(1);
  return lowered.replace(/^(\w+) me /i, "$1 ");
}

/** Builds the post from the task data (PRD 7.3 shape). */
export function scriptedPostText(
  task: Pick<AgentTask, "description" | "place" | "time_limit_minutes">,
  subtask: { price: string; claim_url: string },
): string {
  return (
    `${dollars(subtask.price)} to ${helperPhrase(task.description)} at ${task.place} ` +
    `in the next ${task.time_limit_minutes} min. First to claim gets it: ${subtask.claim_url}`
  );
}
