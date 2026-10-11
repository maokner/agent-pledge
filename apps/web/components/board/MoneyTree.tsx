import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { Spinner } from "@/components/ui/Spinner";
import { explorerTxUrl, formatRlusd, formatSignedRlusd } from "@/lib/format";
import {
  buildMoneyTree,
  moneyPlan,
  summarizeMoney,
  type EdgeState,
  type MoneyEdge,
  type MoneyNode,
  type MoneyRole,
} from "@/lib/board/money-tree";
import type { TaskView } from "@/lib/board/selectors";

/**
 * The money tree for one task (PRD 2.2, 2.3, 9.1). The shape comes from the
 * data (see lib/board/money-tree.ts); this component only draws it.
 */
export function MoneyTree({ view }: { view: TaskView }) {
  const root = buildMoneyTree(view);
  return (
    <section aria-label="Money tree" className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
      <h3 className="text-sm font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-300">Money tree</h3>
      <div className="mt-2">
        <TreeNode node={root} />
      </div>
      <MoneyResult view={view} />
      <Legend />
    </section>
  );
}

function TreeNode({ node }: { node: MoneyNode }) {
  return (
    <div className="flex flex-col items-start">
      <div className="flex flex-wrap items-center gap-2">
        <NodeBox node={node} />
        {node.receives.map((edge) => (
          <ReceivedChip key={edge.id} edge={edge} />
        ))}
      </div>
      {node.children.length > 0 && (
        <div className="flex flex-wrap gap-x-6">
          {node.children.map(({ edge, node: child }) => (
            <div key={child.id} className="flex flex-col items-start">
              <EdgeDown edge={edge} />
              <TreeNode node={child} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NODE_CLASS: Record<MoneyRole, string> = {
  requester: "rounded-lg border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900",
  vault: "rounded-lg border-zinc-800 bg-zinc-800 text-white dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900",
  task_nft: "rounded-full border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950",
  agent: "rounded-lg border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900",
  subtask_nft: "rounded-full border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950",
  helper: "rounded-lg border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900",
};

function NodeBox({ node }: { node: MoneyNode }) {
  return (
    <div className={`inline-flex flex-wrap items-baseline gap-x-2 border px-3 py-1 ${NODE_CLASS[node.role]}`}>
      <span className="font-semibold">{node.title}</span>
      {node.detail && <span className="text-sm opacity-75">{node.detail}</span>}
      {node.nftId && <ExplorerLink nft={node.nftId} className="text-xs" />}
      {node.parentNftId && (
        <span className="text-xs opacity-75">
          parent <ExplorerLink nft={node.parentNftId} />
        </span>
      )}
    </div>
  );
}

const EDGE_CLASS: Record<EdgeState, { line: string; text: string }> = {
  planned: { line: "border-dashed border-zinc-300 dark:border-zinc-600", text: "text-zinc-400 dark:text-zinc-500" },
  pending: { line: "border-amber-400", text: "text-amber-700 dark:text-amber-300" },
  settled: { line: "border-sky-500", text: "text-sky-800 dark:text-sky-300" },
  paid: { line: "border-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  returned: { line: "border-violet-500", text: "text-violet-700 dark:text-violet-300" },
  failed: { line: "border-rose-500", text: "text-rose-700 dark:text-rose-300" },
};

function EdgeMark({ state }: { state: EdgeState }) {
  if (state === "pending") return <Spinner className="size-3" />;
  const mark = { planned: "↓", settled: "↓", paid: "✓", returned: "↩", failed: "✕" }[state];
  return <span aria-hidden>{mark}</span>;
}

/** A line from a node down to its child, with the amount on it. */
function EdgeDown({ edge }: { edge: MoneyEdge }) {
  const style = EDGE_CLASS[edge.state];
  const label = (
    <>
      <EdgeMark state={edge.state} />
      {edge.label}
    </>
  );
  return (
    <div className={`ml-5 border-l-4 py-1.5 pl-3 transition-colors duration-700 ${style.line}`}>
      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold transition-colors duration-700 ${style.text}`} title={stateTitle(edge)}>
        {edge.txHash ? (
          <a href={explorerTxUrl(edge.txHash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
            {label}
          </a>
        ) : (
          label
        )}
      </span>
    </div>
  );
}

const CHIP_CLASS: Record<EdgeState, string> = {
  planned: "border-zinc-300 text-zinc-500",
  pending: "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  settled: "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  paid: "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  returned: "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  failed: "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

/** Money the vault sends back out to a node: a payout (green) or a refund (return color). */
function ReceivedChip({ edge }: { edge: MoneyEdge }) {
  return (
    <a
      href={edge.txHash ? explorerTxUrl(edge.txHash) : undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={[edge.note, stateTitle(edge)].filter(Boolean).join(". ")}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-sm font-semibold motion-safe:animate-fade-in hover:underline ${CHIP_CLASS[edge.state]}`}
    >
      <span aria-hidden>←</span>
      <EdgeMark state={edge.state} />
      {edge.label}
      <span className="sr-only">from the vault</span>
    </a>
  );
}

function stateTitle(edge: MoneyEdge): string {
  switch (edge.state) {
    case "planned":
      return "Not on the ledger yet";
    case "pending":
      return "Pending: waiting for a validated ledger";
    case "settled":
      return "Validated. The money is held in the vault";
    case "paid":
      return "Validated";
    case "returned":
      return "Validated refund";
    case "failed":
      return "The ledger rejected this transaction";
  }
}

const PARTY_NAME = { requester: "Requester", agent: "Agent", helper: "Helper" } as const;

/** The plan at step 8, and the PRD 2.2 / 2.3 result once the task is finished. */
function MoneyResult({ view }: { view: TaskView }) {
  const finished = view.task.status === "done" || view.task.status === "failed";
  if (!finished) {
    const plan = moneyPlan(view);
    if (!plan) return null;
    return (
      <p className="mt-3 text-sm">
        <span className="font-semibold">Plan: </span>
        {formatRlusd(plan.in)} in, {formatRlusd(plan.toHelper)} to the helper, {formatRlusd(plan.toAgent)} to the agent.
      </p>
    );
  }

  const rows = summarizeMoney(view);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">Result:</span>
      {view.task.status === "done" && (
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Requester has a seat
        </span>
      )}
      {rows.map((row) => {
        const net = Number(row.net);
        // On success the requester bought a seat: show what they paid, not a red loss (PRD 2.2).
        const boughtSeat = row.party === "requester" && view.task.status === "done";
        const tone =
          boughtSeat
            ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            : net > 0
            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
            : net < 0
              ? "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
        return (
          <span key={row.party} className={`rounded-full px-2.5 py-0.5 font-semibold tabular-nums ${tone}`} title={`Paid ${formatRlusd(row.paid)}, got ${formatRlusd(row.got)}`}>
            {PARTY_NAME[row.party]} {boughtSeat ? `paid ${formatRlusd(row.paid)}` : formatSignedRlusd(row.net)}
          </span>
        );
      })}
    </div>
  );
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-3 w-1 ${cls}`} />
      {label}
    </span>
  );
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
      {item("bg-amber-400", "pending")}
      {item("bg-sky-500", "held in the vault")}
      {item("bg-emerald-500", "paid")}
      {item("bg-violet-500", "returned")}
    </p>
  );
}
