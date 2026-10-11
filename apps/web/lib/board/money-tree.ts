/**
 * The money tree for one task (PRD 2.2, 2.3, 9.1), built from the task, its
 * sub-tasks and its ledger transactions. No positions are fixed here: the
 * tree's shape comes from the data (one branch per sub-task, hung under the
 * task NFT its parent_nft_id names), and the component lays it out.
 *
 *   requester -> vault -> task NFT -> local agent -> sub-task NFT -> helper
 *
 * Money that the vault pays back out (payouts and refunds) is attached to the
 * node that receives it, as `receives` edges.
 */
import type { LedgerTx, NftId, RlusdAmount, Subtask, Task, TxHash, TxKind, XrplAddress } from "@agent-pledge/shared";
import { formatRlusd } from "../format";
import type { TaskView } from "./selectors";

/**
 * - planned: expected, no transaction yet
 * - pending: submitted, waiting for a validated ledger
 * - settled: validated; the money sits in the vault until the task is paid
 * - paid: validated payout, or any validated step of a task that is done (the tree turns green)
 * - returned: validated refund on failure
 * - failed: the transaction failed on the ledger
 */
export type EdgeState = "planned" | "pending" | "settled" | "paid" | "returned" | "failed";

export interface MoneyEdge {
  id: string;
  kind: TxKind;
  /** Short label on the line, for example "$5.00 in" or "$4.00 to helper". */
  label: string;
  /** Longer explanation, for example "$5.00 reward + $1.00 pledge back". */
  note: string | null;
  state: EdgeState;
  /** The transaction behind the edge, for its explorer link. Null while planned. */
  txHash: TxHash | null;
}

export type MoneyRole = "requester" | "vault" | "task_nft" | "agent" | "subtask_nft" | "helper";

export interface MoneyNode {
  id: string;
  role: MoneyRole;
  title: string;
  detail: string | null;
  nftId: NftId | null;
  /** Sub-task NFTs only: the task NFT this one hangs under (PRD 5.3). */
  parentNftId: NftId | null;
  address: XrplAddress | null;
  /** Payouts and refunds the vault sends to this node. */
  receives: MoneyEdge[];
  children: { edge: MoneyEdge; node: MoneyNode }[];
}

export function buildMoneyTree({ task, subtasks, txs }: TaskView): MoneyNode {
  const edges = new EdgeFactory(task, txs);
  const pledge = formatRlusd(task.pledge);
  const vaultAddress = txs.find((tx) => tx.kind === "task_escrow")?.to ?? null;

  const branches = subtasks.filter((sub) => belongsTo(sub, task)).map((sub) => subtaskBranch(sub, edges));

  const agent = node({
    id: `${task.id}:agent`,
    role: "agent",
    title: "Local agent",
    detail: task.status === "open" ? "not claimed yet" : null,
    address: task.agent_address,
    receives: edges.received(["agent_payout", "agent_refund"]),
    children: branches.length > 0 ? branches : [plannedBranch(task, edges)],
  });

  const taskNft = node({
    id: `${task.id}:task_nft`,
    role: "task_nft",
    title: "Task NFT",
    detail: `${formatRlusd(task.price)} task`,
    nftId: task.nft_id,
    children: [{ edge: edges.down("task_claim", null, `claims, ${pledge} pledge`), node: agent }],
  });

  const vault = node({
    id: `${task.id}:vault`,
    role: "vault",
    title: "Vault",
    detail: `holds ${formatRlusd(vaultBalance(txs))}`,
    address: vaultAddress,
    children: [{ edge: edges.down("task_nft_mint", null, "mints the task NFT"), node: taskNft }],
  });

  return node({
    id: `${task.id}:requester`,
    role: "requester",
    title: "Requester",
    detail: `pays ${formatRlusd(task.price)}`,
    address: task.requester_address,
    receives: edges.received(["requester_refund"]),
    children: [{ edge: edges.down("task_escrow", null, `${formatRlusd(task.price)} in`), node: vault }],
  });
}

/** The split the board shows at step 8: "$5.00 in, $4.00 to the helper, $1.00 to the agent". */
export interface MoneyPlan {
  in: RlusdAmount;
  toHelper: RlusdAmount;
  toAgent: RlusdAmount;
}

/** The planned split, from the task price and the newest sub-task's price. Null before any sub-task. */
export function moneyPlan({ task, subtasks }: TaskView): MoneyPlan | null {
  const sub = subtasks.at(-1);
  if (!sub) return null;
  return { in: task.price, toHelper: sub.price, toAgent: fromUnits(toUnits(task.price) - toUnits(sub.price)) };
}

/** One row of the PRD 2.2 / 2.3 "who pays, who gets" table, from validated payments only. */
export interface PartyResult {
  party: "requester" | "agent" | "helper";
  paid: RlusdAmount;
  got: RlusdAmount;
  net: RlusdAmount;
}

const PAYS: Record<PartyResult["party"], TxKind[]> = {
  requester: ["task_escrow"],
  agent: ["task_claim", "subtask_escrow"],
  helper: [],
};
const GETS: Record<PartyResult["party"], TxKind[]> = {
  requester: ["requester_refund"],
  agent: ["agent_payout", "agent_refund"],
  helper: ["helper_payout"],
};

export function summarizeMoney({ txs }: TaskView): PartyResult[] {
  return (["requester", "agent", "helper"] as const).map((party) => {
    const paid = validatedTotal(txs, PAYS[party]);
    const got = validatedTotal(txs, GETS[party]);
    return { party, paid: fromUnits(paid), got: fromUnits(got), net: fromUnits(got - paid) };
  });
}

/* ---------- internals ---------- */

const INTO_VAULT: TxKind[] = ["task_escrow", "task_claim", "subtask_escrow"];
const OUT_OF_VAULT: TxKind[] = ["helper_payout", "agent_payout", "requester_refund", "agent_refund"];
const REFUNDS: TxKind[] = ["requester_refund", "agent_refund"];
const PAYOUTS: TxKind[] = ["helper_payout", "agent_payout"];

function belongsTo(sub: Subtask, task: Task): boolean {
  // Once both NFTs exist, parent_nft_id is the link (PRD 5.3). Before the
  // sub-task NFT is minted, fall back to task_id.
  if (sub.parent_nft_id && task.nft_id) return sub.parent_nft_id === task.nft_id;
  return sub.task_id === task.id;
}

function subtaskBranch(sub: Subtask, edges: EdgeFactory): { edge: MoneyEdge; node: MoneyNode } {
  const helper = node({
    id: `${sub.id}:helper`,
    role: "helper",
    title: "Helper",
    detail: helperDetail(sub),
    address: sub.helper_address,
    receives: edges.received(["helper_payout"], sub.id),
  });
  return {
    edge: edges.down("subtask_escrow", sub.id, `${formatRlusd(sub.price)} funds the sub-task`),
    node: node({
      id: `${sub.id}:subtask_nft`,
      role: "subtask_nft",
      title: "Sub-task NFT",
      detail: `${formatRlusd(sub.price)} sub-task`,
      nftId: sub.nft_id,
      parentNftId: sub.parent_nft_id,
      children: [{ edge: edges.down("subtask_claim", sub.id, "claims"), node: helper }],
    }),
  };
}

function plannedBranch(task: Task, edges: EdgeFactory): { edge: MoneyEdge; node: MoneyNode } {
  const helper = node({ id: `${task.id}:helper`, role: "helper", title: "Helper", detail: "not claimed yet" });
  return {
    edge: edges.planned("subtask_escrow", `${task.id}:subtask_escrow`, "funds a sub-task"),
    node: node({
      id: `${task.id}:subtask_nft`,
      role: "subtask_nft",
      title: "Sub-task NFT",
      detail: "not made yet",
      children: [{ edge: edges.planned("subtask_claim", `${task.id}:subtask_claim`, "claims"), node: helper }],
    }),
  };
}

function helperDetail(sub: Subtask): string | null {
  if (sub.helper_address) return null;
  return sub.status === "failed" ? "nobody claimed" : "not claimed yet";
}

function node(fields: Partial<MoneyNode> & Pick<MoneyNode, "id" | "role" | "title">): MoneyNode {
  return { detail: null, nftId: null, parentNftId: null, address: null, receives: [], children: [], ...fields };
}

class EdgeFactory {
  constructor(
    private readonly task: Task,
    private readonly txs: LedgerTx[],
  ) {}

  /** An edge of the tree itself; planned until its transaction exists. */
  down(kind: TxKind, subtaskId: string | null, label: string): MoneyEdge {
    const tx = this.latest(kind, subtaskId);
    if (!tx) return this.planned(kind, `${subtaskId ?? this.task.id}:${kind}`, label);
    return { id: tx.hash, kind, label, note: null, state: this.stateOf(tx), txHash: tx.hash };
  }

  planned(kind: TxKind, id: string, label: string): MoneyEdge {
    return { id, kind, label, note: null, state: "planned", txHash: null };
  }

  /** Payouts and refunds of these kinds that exist so far, oldest first. */
  received(kinds: TxKind[], subtaskId?: string): MoneyEdge[] {
    return this.txs
      .filter((tx) => kinds.includes(tx.kind) && (subtaskId === undefined || tx.subtask_id === subtaskId))
      .map((tx) => ({
        id: tx.hash,
        kind: tx.kind,
        label: receivedLabel(tx),
        note: this.receivedNote(tx),
        state: this.stateOf(tx),
        txHash: tx.hash,
      }));
  }

  private receivedNote(tx: LedgerTx): string | null {
    const price = formatRlusd(this.task.price);
    const pledge = formatRlusd(this.task.pledge);
    if (tx.kind === "agent_payout") return `${price} reward + ${pledge} pledge back`;
    if (tx.kind === "requester_refund") return `${price} back + the agent's ${pledge} pledge`;
    if (tx.kind === "agent_refund") return "sub-task money back";
    return null;
  }

  private latest(kind: TxKind, subtaskId: string | null): LedgerTx | undefined {
    return this.txs.filter((tx) => tx.kind === kind && (subtaskId === null || tx.subtask_id === subtaskId)).at(-1);
  }

  private stateOf(tx: LedgerTx): EdgeState {
    if (tx.status === "pending") return "pending";
    if (tx.status === "failed") return "failed";
    if (REFUNDS.includes(tx.kind)) return "returned";
    if (PAYOUTS.includes(tx.kind) || this.task.status === "done") return "paid";
    return "settled";
  }
}

function receivedLabel(tx: LedgerTx): string {
  const amount = formatRlusd(tx.amount ?? "0");
  switch (tx.kind) {
    case "helper_payout":
      return `${amount} to helper`;
    case "agent_payout":
      return `${amount} to agent`;
    default:
      return `${amount} back`;
  }
}

/* RLUSD arithmetic in millionths, so "4.5" + "1" is exactly "5.5". */
const SCALE = 1_000_000;

function toUnits(amount: RlusdAmount | null): number {
  const n = Number(amount ?? "0");
  return Number.isFinite(n) ? Math.round(n * SCALE) : 0;
}

function fromUnits(units: number): RlusdAmount {
  return String(units / SCALE);
}

function validatedTotal(txs: LedgerTx[], kinds: TxKind[]): number {
  return txs
    .filter((tx) => tx.status === "validated" && kinds.includes(tx.kind))
    .reduce((sum, tx) => sum + toUnits(tx.amount), 0);
}

function vaultBalance(txs: LedgerTx[]): RlusdAmount {
  return fromUnits(validatedTotal(txs, INTO_VAULT) - validatedTotal(txs, OUT_OF_VAULT));
}
