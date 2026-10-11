import { taskTag } from "@/lib/board/agent-log";
import { selectPartyNames, splitTxs, taskHolder, type TaskView } from "@/lib/board/selectors";
import { cn } from "@/lib/cn";
import { formatMinutes, formatRlusd } from "@/lib/format";
import { failureText } from "@/lib/labels";
import { Fact, Facts } from "./Facts";
import { MoneyTree } from "./MoneyTree";
import { SubtaskCard } from "./SubtaskCard";
import { GLOW, WORK_BORDER } from "./term-style";
import { ExplorerLink, Money, Pane, TimeLeft, Waiting, WorkStatusTag } from "./term";
import { TxList } from "./TxList";

/**
 * One task window (PRD 9.1): the task and its status, its money tree and its
 * own transactions, and its sub-tasks nested inside. `arrived` plays the
 * new-task flash on the title bar (a task that came in while the board was
 * open; never on first load).
 */
export function TaskCard({ view, arrived = false }: { view: TaskView; arrived?: boolean }) {
  const { task, subtasks } = view;
  const active = task.status === "open" || task.status === "claimed";
  const names = selectPartyNames(view);
  const txs = splitTxs(view);

  return (
    <Pane
      aria-label={`Task: ${task.description}`}
      title={`Task ${taskTag(task.id)}`}
      flash={arrived}
      className={cn("@container", WORK_BORDER[task.status])}
      bodyClassName="p-3 sm:p-4"
      right={
        <span className="flex items-baseline gap-4">
          <Money amount={task.price} className={cn("text-2xl font-bold", GLOW)} />
          <WorkStatusTag status={task.status} size="lg" />
        </span>
      }
    >
      <header className="min-w-0">
        <p className={cn("text-2xl font-bold wrap-anywhere", GLOW)}>
          <span aria-hidden className="text-term-fg-dim">
            &gt;{" "}
          </span>
          {task.description}
        </p>
        <p className="text-lg text-term-fg-dim wrap-anywhere">@ {task.place}</p>
      </header>

      <Facts>
        <Fact label="Time limit">{formatMinutes(task.time_limit_minutes)}</Fact>
        <Fact label="Time left">
          {active ? (
            <TimeLeft
              deadline={task.deadline_at}
              limitMinutes={task.time_limit_minutes}
              className={cn("text-lg font-bold", GLOW)}
            />
          ) : (
            <span className="text-term-fg-dim">Finished</span>
          )}
        </Fact>
        <Fact label="Held by">{taskHolder(task)}</Fact>
        <Fact label="Pledge">
          <Money amount={task.pledge} />
        </Fact>
        {task.nft_id && (
          <Fact label="Task NFT">
            <ExplorerLink nft={task.nft_id} href={task.nft_explorer_url} />
          </Fact>
        )}
      </Facts>

      {task.status === "failed" && (
        <p
          role="status"
          className="mt-3 border border-term-red px-3 py-2 text-lg font-bold text-term-red"
        >
          [ERR] FAILED{failureText(task) ? `: ${failureText(task)}.` : "."}{" "}
          <span className="text-term-amber">
            <span aria-hidden>↩ </span>The requester gets {formatRlusd(task.price)} back plus the
            agent&apos;s {formatRlusd(task.pledge)} pledge.
          </span>
        </p>
      )}

      <div className="mt-4 grid gap-4 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0">
          <MoneyTree view={view} />
          <TxList txs={txs.task} names={names} title="Task transactions" />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {subtasks.length === 0 ? (
            <Waiting>
              {task.status === "open"
                ? "The local agent has not claimed this task yet"
                : "No sub-task yet"}
            </Waiting>
          ) : (
            subtasks.map((subtask) => (
              <SubtaskCard
                key={subtask.id}
                subtask={subtask}
                txs={txs.bySubtask.get(subtask.id) ?? []}
                names={names}
              />
            ))
          )}
        </div>
      </div>
    </Pane>
  );
}
