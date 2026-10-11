import type { ClaimView } from "@agent-pledge/shared";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { formatRlusd } from "@/lib/format";
import { Spinner } from "./parts";

/** The PIN was right and the payout transaction is pending (PRD 2.1 step 13). The page polls until it validates. */
export function PayingView({ view }: { view: ClaimView }) {
  const amount = formatRlusd(view.payout?.amount ?? view.subtask.price);
  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-2xl bg-amber-50 p-6 text-center ring-1 ring-amber-200 dark:bg-amber-950 dark:ring-amber-800"
    >
      <Spinner className="size-12 text-amber-600 dark:text-amber-400" />
      <h2 className="text-4xl font-extrabold">Paying you {amount}</h2>
      <p className="text-lg">The PIN is right. The money is on its way over the XRP Ledger. This takes a few seconds.</p>
      {view.payout && (
        <p className="text-base text-zinc-700 dark:text-zinc-300">
          Transaction (pending): <ExplorerLink tx={view.payout.tx_hash} />
        </p>
      )}
    </section>
  );
}
