import { cn } from "@/lib/cn";
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
import { edgeTag } from "@/lib/board/terminal";
import { GLOW, LINK, TONE_BORDER, TONE_TEXT } from "./term-style";
import { ExplorerLink, SectionTitle } from "./term";

/**
 * The money tree for one task (PRD 2.2, 2.3, 9.1). The shape comes from the
 * data (see lib/board/money-tree.ts); this component only draws it, as a
 * terminal tree: each edge is a line with its state as a tag (`[..]`
 * pending, `[HELD]` in the vault, `[OK]` paid, `[RFND] ↩` returned).
 * Projector mode (#43) makes it bigger and leaves out the NFT IDs, which
 * nobody can read on a wall; the transactions and the normal view keep them.
 */
export function MoneyTree({ view }: { view: TaskView }) {
  const root = buildMoneyTree(view);
  return (
    <section aria-label="Money tree" className="border border-dashed border-term-line p-3 projector:text-lg">
      <SectionTitle className="projector:text-lg">Money tree</SectionTitle>
      <div className="mt-2 projector:mt-1">
        <TreeNode node={root} />
      </div>
      <MoneyResult view={view} />
      <Legend />
    </section>
  );
}

function TreeNode({ node }: { node: MoneyNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <NodeBox node={node} />
        {node.receives.map((edge) => (
          <ReceivedChip key={edge.id} edge={edge} />
        ))}
      </div>
      {node.children.length > 0 && (
        <div className="flex flex-wrap gap-x-6">
          {node.children.map(({ edge, node: child }) => (
            <div key={child.id} className="flex min-w-0 flex-col items-start">
              <EdgeDown edge={edge} />
              <TreeNode node={child} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The vault is the one solid block; NFTs are in angle brackets, parties in square ones. */
const NODE_CLASS: Record<MoneyRole, string> = {
  requester: "border-term-fg-dim",
  vault: "border-term-fg bg-term-fg text-term-bg text-shadow-none",
  task_nft: "border-dashed border-term-fg-dim",
  agent: "border-term-fg-dim",
  subtask_nft: "border-dashed border-term-fg-dim",
  helper: "border-term-fg-dim",
};

function NodeBox({ node }: { node: MoneyNode }) {
  const isNft = node.role === "task_nft" || node.role === "subtask_nft";
  const isVault = node.role === "vault";
  return (
    <div className={cn("inline-flex min-w-0 flex-wrap items-baseline gap-x-2 border px-2", NODE_CLASS[node.role])}>
      <span className={cn("font-bold uppercase", !isVault && GLOW)}>
        {isNft ? `<${node.title}>` : node.title}
      </span>
      {node.detail && <span className={cn("text-sm projector:text-lg", !isVault && "text-term-fg-dim")}>{node.detail}</span>}
      {node.nftId && <ExplorerLink nft={node.nftId} className="text-sm projector:hidden" />}
      {node.parentNftId && (
        <span className="text-sm text-term-fg-dim projector:hidden">
          parent <ExplorerLink nft={node.parentNftId} />
        </span>
      )}
    </div>
  );
}

const EDGE_TITLE: Record<EdgeState, string> = {
  planned: "Not on the ledger yet",
  pending: "Pending: waiting for a validated ledger",
  settled: "Validated. The money is held in the vault",
  paid: "Validated",
  returned: "Validated refund",
  failed: "The ledger rejected this transaction",
};

function EdgeLabel({ edge }: { edge: MoneyEdge }) {
  const tag = edgeTag(edge.state);
  return (
    <>
      <span className="font-bold">{tag.tag}</span>
      {tag.word && <span aria-hidden>{tag.word}</span>}
      <span>{edge.label}</span>
    </>
  );
}

/** A line from a node down to its child, with its state tag and the amount on it. */
function EdgeDown({ edge }: { edge: MoneyEdge }) {
  const tone = edgeTag(edge.state).tone;
  return (
    <div className={cn("ml-3 border-l-2 py-1 pl-2 projector:py-0.5", TONE_BORDER[tone])}>
      <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-sm projector:text-lg", TONE_TEXT[tone])} title={EDGE_TITLE[edge.state]}>
        {edge.txHash ? (
          <a href={edge.explorerUrl ?? explorerTxUrl(edge.txHash)} target="_blank" rel="noopener noreferrer" className={cn(LINK, "inline-flex flex-wrap items-baseline gap-x-1.5")}>
            <EdgeLabel edge={edge} />
          </a>
        ) : (
          <EdgeLabel edge={edge} />
        )}
      </span>
    </div>
  );
}

/** Money the vault sends back out to a node: a payout (`[OK]`) or a refund (`[RFND] ↩`). */
function ReceivedChip({ edge }: { edge: MoneyEdge }) {
  const tone = edgeTag(edge.state).tone;
  const content = (
    <>
      <span aria-hidden>&lt;-</span>
      <EdgeLabel edge={edge} />
      <span className="sr-only">from the vault</span>
    </>
  );
  const className = cn("inline-flex flex-wrap items-baseline gap-x-1.5 border px-1 text-sm projector:text-lg", TONE_BORDER[tone], TONE_TEXT[tone]);
  const title = [edge.note, EDGE_TITLE[edge.state]].filter(Boolean).join(". ");
  return edge.txHash ? (
    <a href={edge.explorerUrl ?? explorerTxUrl(edge.txHash)} target="_blank" rel="noopener noreferrer" title={title} className={cn(LINK, "no-underline", className)}>
      {content}
    </a>
  ) : (
    <span title={title} className={className}>
      {content}
    </span>
  );
}

const PARTY_NAME = { requester: "Requester", agent: "Agent", helper: "Helper" } as const;

/** The plan at step 8, and the PRD 2.2 / 2.3 result once the task is finished. */
function MoneyResult({ view }: { view: TaskView }) {
  const finished = view.task.status === "done" || view.task.status === "failed";
  if (!finished) {
    const plan = moneyPlan(view);
    if (!plan) return null;
    return (
      <p className="mt-3 text-sm projector:mt-2 projector:text-lg">
        <span className="font-bold text-term-fg-dim">PLAN: </span>
        {formatRlusd(plan.in)} in, {formatRlusd(plan.toHelper)} to the helper, {formatRlusd(plan.toAgent)} to the agent.
      </p>
    );
  }

  const rows = summarizeMoney(view);
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm projector:mt-2 projector:text-lg">
      <span className="font-bold text-term-fg-dim">RESULT:</span>
      {view.task.status === "done" && <span className={cn("font-bold", TONE_TEXT.validated, GLOW)}>[OK] Requester has a seat</span>}
      {rows.map((row) => {
        const net = Number(row.net);
        // On success the requester bought a seat: show what they paid, not a red loss (PRD 2.2).
        const boughtSeat = row.party === "requester" && view.task.status === "done";
        const tone = boughtSeat || net === 0 ? "text-term-fg-dim" : net > 0 ? "text-term-fg" : "text-term-red";
        return (
          <span key={row.party} className={cn("font-bold tabular-nums", tone)} title={`Paid ${formatRlusd(row.paid)}, got ${formatRlusd(row.got)}`}>
            {PARTY_NAME[row.party]} {boughtSeat ? `paid ${formatRlusd(row.paid)}` : formatSignedRlusd(row.net)}
          </span>
        );
      })}
    </div>
  );
}

function Legend() {
  const states: EdgeState[] = ["pending", "settled", "paid", "returned"];
  const words: Record<string, string> = { pending: "pending", settled: "held in the vault", paid: "paid", returned: "returned" };
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-term-fg-dim projector:mt-1 projector:text-base">
      {states.map((state) => {
        const tag = edgeTag(state);
        return (
          <span key={state}>
            <span className={TONE_TEXT[tag.tone]}>
              {tag.tag}
              {tag.word ? ` ${tag.word}` : ""}
            </span>{" "}
            {words[state]}
          </span>
        );
      })}
    </p>
  );
}
