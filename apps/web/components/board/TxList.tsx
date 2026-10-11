"use client";

import { useState } from "react";
import type { LedgerTx, TxStatus } from "@agent-pledge/shared";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { Money } from "@/components/ui/Money";
import { Spinner } from "@/components/ui/Spinner";
import { compactTxs } from "@/lib/board/selectors";
import { TX_KIND_LABEL, TX_STATUS_LABEL, TX_TYPE_LABEL } from "@/lib/labels";
import { useChangeCount } from "@/lib/use-change-count";

/**
 * Ledger transactions, oldest first, each with an explorer link (PRD R4, 9.1).
 * Compact by default: the newest few rows plus anything still pending, so the
 * list does not push the money tree off screen.
 */
export function TxList({
  txs,
  names,
  title = "Ledger transactions",
  compactRows = 3,
}: {
  txs: LedgerTx[];
  /** Address -> "Requester", "Vault", "Local agent" or "Helper". */
  names: Map<string, string>;
  title?: string;
  compactRows?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (txs.length === 0) return null;

  const shown = expanded ? txs : compactTxs(txs, compactRows);
  const pending = txs.filter((tx) => tx.status === "pending").length;
  const canToggle = expanded || shown.length < txs.length;

  return (
    <section className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 projector:text-xl projector:font-bold projector:text-zinc-800">
          {title}{" "}
          <span className="font-normal text-zinc-500 projector:text-zinc-700">
            ({txs.length}
            {pending > 0 && <span className="text-amber-700 dark:text-amber-300 projector:font-semibold projector:text-amber-800">, {pending} pending</span>})
          </span>
        </h4>
        {canToggle && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300 projector:text-base"
          >
            {expanded ? "Show fewer" : `Show all ${txs.length}`}
          </button>
        )}
      </div>
      <ol className="mt-1 divide-y divide-zinc-200 dark:divide-zinc-800">
        {shown.map((tx) => (
          <TxRow key={tx.hash} tx={tx} names={names} />
        ))}
      </ol>
    </section>
  );
}

function TxRow({ tx, names }: { tx: LedgerTx; names: Map<string, string> }) {
  const changes = useChangeCount(tx.status);
  const flash = changes > 0 && tx.status === "validated" ? "motion-safe:animate-row-flash" : "";
  return (
    <li>
      <div key={changes} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded px-1 py-1.5 text-sm projector:py-1 projector:text-lg ${flash}`}>
        <TxStatusMark status={tx.status} engineResult={tx.engine_result} />
        <span className="w-16 shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-center text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 projector:hidden">
          {TX_TYPE_LABEL[tx.tx_type]}
        </span>
        <span className="min-w-0 flex-1 basis-48 projector:basis-40">
          <span className="block font-medium">{TX_KIND_LABEL[tx.kind]}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400 projector:text-base projector:text-zinc-700">
            <Party address={tx.from} names={names} />
            {tx.to && (
              <>
                {" → "}
                <Party address={tx.to} names={names} />
              </>
            )}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-3">
          {tx.amount && <Money amount={tx.amount} className="font-semibold" />}
          <ExplorerLink tx={tx.hash} className="text-xs projector:text-base" />
        </span>
      </div>
    </li>
  );
}

const STATUS_CLASS: Record<TxStatus, string> = {
  pending: "text-amber-600 dark:text-amber-400 projector:text-amber-800",
  validated: "text-emerald-600 dark:text-emerald-400 projector:text-emerald-800",
  failed: "text-rose-600 dark:text-rose-400 projector:text-rose-800",
};

function TxStatusMark({ status, engineResult }: { status: TxStatus; engineResult: string | null }) {
  const label = status === "failed" && engineResult ? `${TX_STATUS_LABEL[status]}: ${engineResult}` : TX_STATUS_LABEL[status];
  return (
    <span className={`inline-flex w-24 shrink-0 items-center gap-1.5 text-xs font-semibold projector:w-32 projector:text-base projector:font-bold ${STATUS_CLASS[status]}`} title={label}>
      {status === "pending" ? <Spinner /> : <span aria-hidden>{status === "validated" ? "✓" : "✕"}</span>}
      {TX_STATUS_LABEL[status]}
    </span>
  );
}

function Party({ address, names }: { address: string; names: Map<string, string> }) {
  const name = names.get(address);
  return <ExplorerLink account={address} label={name} />;
}
