import type { Subtask, Task } from "@agent-pledge/shared";
import { formatRlusd } from "@/lib/format";

/**
 * Placeholder money tree (PRD 2.2, 9.1): who pays what for this task.
 * The real tree with lines and colors is issue #33.
 */
export function MoneyTree({ task, subtasks }: { task: Task; subtasks: Subtask[] }) {
  const sub = subtasks.at(-1);
  const agentKeeps = sub ? Number(task.price) - Number(sub.price) : null;
  return (
    <p className="mt-3 text-base">
      Requester pays {formatRlusd(task.price)}
      {sub && (
        <>
          {" "}
          → helper gets {formatRlusd(sub.price)} → agent keeps {formatRlusd(String(agentKeeps))}
        </>
      )}
    </p>
  );
}
