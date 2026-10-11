import { selectPartyNames, splitTxs, taskHolder, type TaskView } from "@/lib/board/selectors";
import { Countdown } from "@/components/ui/Countdown";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { Money } from "@/components/ui/Money";
import { formatMinutes, formatRlusd } from "@/lib/format";
import { FAILURE_REASON_LABEL } from "@/lib/labels";
import { Fact, Facts } from "./Facts";
import { LiveStatusBadge, StatusGlow } from "./LiveStatus";
import { MoneyTree } from "./MoneyTree";
import { WORK_STATUS_STYLE } from "./status-style";
import { SubtaskCard } from "./SubtaskCard";
import { TxList } from "./TxList";

/**
 * One task card (PRD 9.1): the task and its status, its money tree and its
 * own transactions, and its sub-tasks nested inside.
 */
export function TaskCard({ view }: { view: TaskView }) {
  const { task, subtasks } = view;
  const active = task.status === "open" || task.status === "claimed";
  const names = selectPartyNames(view);
  const txs = splitTxs(view);

  return (
    <article
      aria-label={`Task: ${task.description}`}
      className={`@container relative rounded-xl border border-l-8 border-zinc-200 p-4 shadow-sm sm:p-5 dark:border-zinc-700 ${WORK_STATUS_STYLE[task.status].card}`}
    >
      <StatusGlow status={task.status} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">{task.description}</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-300">{task.place}</p>
        </div>
        <div className="flex items-center gap-3">
          <Money amount={task.price} className="text-3xl font-bold" />
          <LiveStatusBadge status={task.status} size="lg" />
        </div>
      </header>

      <Facts>
        <Fact label="Time limit">{formatMinutes(task.time_limit_minutes)}</Fact>
        <Fact label="Time left">
          {active ? <Countdown deadline={task.deadline_at} className="text-xl font-bold" /> : <span className="text-zinc-500">Finished</span>}
        </Fact>
        <Fact label="Held by">{taskHolder(task)}</Fact>
        <Fact label="Pledge">
          <Money amount={task.pledge} />
        </Fact>
        {task.nft_id && (
          <Fact label="Task NFT">
            <ExplorerLink nft={task.nft_id} />
          </Fact>
        )}
      </Facts>

      {task.status === "failed" && (
        <p role="status" className="mt-3 rounded-md bg-rose-600 px-4 py-3 text-lg font-bold text-white">
          Failed{task.failure_reason ? `: ${FAILURE_REASON_LABEL[task.failure_reason]}.` : "."}{" "}
          <span className="font-semibold">
            The requester gets {formatRlusd(task.price)} back plus the agent&apos;s {formatRlusd(task.pledge)} pledge.
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
            <p className="rounded-lg border-2 border-dashed border-zinc-300 p-4 text-center text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
              {task.status === "open" ? "The local agent has not claimed this task yet." : "No sub-task yet."}
            </p>
          ) : (
            subtasks.map((subtask) => (
              <SubtaskCard key={subtask.id} subtask={subtask} txs={txs.bySubtask.get(subtask.id) ?? []} names={names} />
            ))
          )}
        </div>
      </div>
    </article>
  );
}
