// The money tree for one task (README 2.2): who paid what into the vault, who got which NFT,
// and what each party ends with. Pure: computes rows from a TaskView.
import { toCents } from "./common.js";

/** The newest transaction of `kind` (optionally for one sub-task). */
function findTx(task, kind, subtaskId) {
  const list = task.transactions.filter(
    (t) => t.kind === kind && (subtaskId === undefined || t.subtask_id === subtaskId),
  );
  return list[list.length - 1] ?? null;
}

/** Edge state: "todo" (no tx yet), "pending", "ok" (validated), "failed" (tx failed). */
function edgeState(tx) {
  if (!tx) return "todo";
  if (tx.status === "validated") return "ok";
  if (tx.status === "failed") return "failed";
  return "pending";
}

/** Cents for the row: the ledger amount when the tx carries one, else the expected amount. */
const amountOf = (tx, expected) => (tx && tx.amount != null ? toCents(tx.amount) : expected);

/**
 * Rows of the tree, top to bottom. Each row: { from, to, what, cents, state, tx, refund }.
 * Also returns the result for each party: { requester, agent, helper } with { cents, text, final }.
 */
export function moneyTree(task) {
  const price = toCents(task.price);
  const pledge = toCents(task.pledge);
  const subs = task.subtasks;
  const subCents = subs.reduce((n, s) => n + toCents(s.price), 0);
  const refundReq = findTx(task, "refund_requester");
  const refundAgent = findTx(task, "refund_agent");
  const failed = task.status === "failed" || !!refundReq || !!refundAgent;

  const rows = [];
  const add = (from, to, what, tx, expected, refund = false) =>
    rows.push({ from, to, what, cents: amountOf(tx, expected), state: edgeState(tx), tx, refund });

  add("Requester", "Vault", "pays the price", findTx(task, "task_funding"), price);
  add(
    "Local agent",
    "Vault",
    "pledges, gets the task NFT",
    findTx(task, "task_claim"),
    pledge,
  );
  if (subs.length === 0) {
    rows.push({
      from: "Local agent",
      to: "Vault",
      what: "funds a sub-task",
      cents: null,
      state: "todo",
      tx: null,
      refund: false,
    });
  }
  for (const s of subs) {
    add("Local agent", "Vault", "funds the sub-task", findTx(task, "subtask_funding", s.id), toCents(s.price));
  }

  if (failed) {
    add("Vault", "Requester", "refund: price + pledge", refundReq, price + pledge, true);
    if (subs.length > 0) {
      add("Vault", "Local agent", "refund: sub-task money", refundAgent, subCents, true);
    }
  } else {
    for (const s of subs) {
      const claim = findTx(task, "subtask_claim", s.id);
      const payout = findTx(task, "helper_payout", s.id);
      // Until the payout exists, the claim tx (sub-task NFT to the helper, $0) drives the edge.
      const tx = payout ?? claim;
      rows.push({
        from: "Vault",
        to: "Helper",
        what: payout ? "pays the helper" : claim ? "sub-task NFT to the helper" : "pays the helper",
        cents: payout ? amountOf(payout, toCents(s.price)) : toCents(s.price),
        state: payout ? edgeState(payout) : claim ? (edgeState(claim) === "ok" ? "half" : edgeState(claim)) : "todo",
        tx,
        refund: false,
      });
    }
    if (subs.length === 0) {
      rows.push({
        from: "Vault",
        to: "Helper",
        what: "pays the helper",
        cents: null,
        state: "todo",
        tx: null,
        refund: false,
      });
    }
    add("Vault", "Local agent", "reward + pledge back", findTx(task, "agent_payout"), price + pledge);
  }

  const done = task.status === "done" || task.paid_at != null;
  let result;
  if (failed) {
    const claimed = !!findTx(task, "task_claim") || task.claimed_at != null;
    const back = refundReq?.amount != null ? toCents(refundReq.amount) : price + (claimed ? pledge : 0);
    result = {
      final: true,
      requester: { cents: back - price, text: claimed ? "Refunded + pledge" : "Refunded" },
      agent: { cents: claimed ? -pledge : 0, text: claimed ? "Lost the pledge" : "Never claimed" },
      helper: { cents: 0, text: "Not paid" },
    };
  } else {
    const helperPaid = subs.some((s) => s.paid_at || findTx(task, "helper_payout", s.id));
    result = {
      final: done,
      requester: { cents: -price, text: done ? "Got the seat" : "Pays for the seat" },
      agent: { cents: price - subCents, text: done ? "Earned" : "Will earn" },
      helper: {
        cents: subCents,
        text: helperPaid ? "Earned" : subs.length ? "Will earn" : "No sub-task yet",
      },
    };
  }
  return { rows, result };
}
