import type { ClaimView } from "@agent-pledge/shared";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { formatRlusd } from "@/lib/format";

/** "Paid $4.00" with the explorer link (PRD 9.2 step 7). Shows "Paying…" while the payout is pending. */
export function PaidView({ claim }: { claim: ClaimView }) {
  const payout = claim.payout;
  const paid = claim.state === "paid";
  return (
    <section className={`rounded-xl p-6 text-center ${paid ? "bg-emerald-100 dark:bg-emerald-950" : "bg-amber-100 dark:bg-amber-950"}`}>
      <p className="text-4xl font-bold">
        {paid ? "Paid" : "Paying"} {formatRlusd(payout?.amount ?? claim.subtask.price)}
        {!paid && "…"}
      </p>
      {payout && (
        <p className="mt-3 text-sm">
          Transaction: <ExplorerLink tx={payout.tx_hash} />
        </p>
      )}
    </section>
  );
}
