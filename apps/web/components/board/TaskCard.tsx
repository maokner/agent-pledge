import type { TaskView } from "@/lib/board/selectors";
import { Countdown } from "@/components/ui/Countdown";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { Money } from "@/components/ui/Money";
import { WorkStatusBadge } from "@/components/ui/StatusBadge";
import { MoneyTree } from "./MoneyTree";
import { SubtaskCard } from "./SubtaskCard";
import { TxList } from "./TxList";

/** One task card: the task, its money tree, its sub-tasks and its ledger transactions. */
export function TaskCard({ view }: { view: TaskView }) {
  const { task, subtasks, txs } = view;
  const active = task.status === "open" || task.status === "claimed";

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{task.description}</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-300">{task.place}</p>
        </div>
        <div className="flex items-center gap-3">
          <Money amount={task.price} className="text-2xl font-bold" />
          <WorkStatusBadge status={task.status} />
        </div>
      </header>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
        <div>
          <dt className="inline">Time left: </dt>
          <dd className="inline">{active ? <Countdown deadline={task.deadline_at} /> : "—"}</dd>
        </div>
        <div>
          <dt className="inline">Pledge: </dt>
          <dd className="inline">
            <Money amount={task.pledge} />
          </dd>
        </div>
        {task.nft_id && (
          <div>
            <dt className="inline">Task NFT: </dt>
            <dd className="inline">
              <ExplorerLink nft={task.nft_id} />
            </dd>
          </div>
        )}
        {task.failure_reason && (
          <div>
            <dt className="inline">Failed: </dt>
            <dd className="inline">{task.failure_reason.replaceAll("_", " ")}</dd>
          </div>
        )}
      </dl>

      <MoneyTree task={task} subtasks={subtasks} />

      {subtasks.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {subtasks.map((subtask) => (
            <SubtaskCard key={subtask.id} subtask={subtask} />
          ))}
        </div>
      )}

      <TxList txs={txs} />
    </article>
  );
}
