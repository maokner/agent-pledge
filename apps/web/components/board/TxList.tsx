import type { LedgerTx } from "@agent-pledge/shared";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { Money } from "@/components/ui/Money";
import { TxStatusBadge } from "@/components/ui/StatusBadge";
import { TX_KIND_LABEL } from "@/lib/labels";

/** Every ledger transaction for a task, oldest first, each with an explorer link (PRD 9.1). */
export function TxList({ txs }: { txs: LedgerTx[] }) {
  if (txs.length === 0) return null;
  return (
    <details className="mt-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        Ledger transactions ({txs.length})
      </summary>
      <ol className="mt-2 flex flex-col gap-1 text-sm">
        {txs.map((tx) => (
          <li key={tx.hash} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TxStatusBadge status={tx.status} />
            <span className="min-w-0 flex-1">{TX_KIND_LABEL[tx.kind]}</span>
            {tx.amount && <Money amount={tx.amount} className="font-semibold" />}
            <ExplorerLink tx={tx.hash} />
          </li>
        ))}
      </ol>
    </details>
  );
}
