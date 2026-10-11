"use client";

import { useState } from "react";
import type { LedgerTx } from "@agent-pledge/shared";
import { cn } from "@/lib/cn";
import { compactTxs } from "@/lib/board/selectors";
import { txTag } from "@/lib/board/terminal";
import { TX_KIND_LABEL, TX_STATUS_LABEL, TX_TYPE_LABEL } from "@/lib/labels";
import { useChangeCount } from "@/lib/use-change-count";
import { ExplorerLink, Money, PendingBar, SectionTitle, StatusTag, TermButton, ViewTxLink } from "./term";

/**
 * Ledger transactions, oldest first, each with an explorer link (PRD R4, 9.1).
 * Compact by default: the newest few rows plus anything still pending, so the
 * list does not push the money tree off screen. Each row starts with its
 * status tag: `[..]` with a progress bar while pending, `[OK]` once
 * validated, `[RFND] ↩` for a refund, `[ERR] FAILED`.
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
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <SectionTitle as="h4" className="projector:text-lg">
          {title}{" "}
          <span className="font-normal">
            ({txs.length}
            {pending > 0 && <span className="font-bold text-term-status-pending">, {pending} pending</span>})
          </span>
        </SectionTitle>
        {canToggle && (
          <TermButton onClick={() => setExpanded((e) => !e)} className="projector:text-base">
            {expanded ? "SHOW FEWER" : `SHOW ALL ${txs.length}`}
          </TermButton>
        )}
      </div>
      <ol className="mt-1 divide-y divide-dashed divide-term-line border-y border-dashed border-term-line">
        {shown.map((tx) => (
          <TxRow key={tx.hash} tx={tx} names={names} />
        ))}
      </ol>
    </section>
  );
}

function TxRow({ tx, names }: { tx: LedgerTx; names: Map<string, string> }) {
  const changes = useChangeCount(tx.status);
  const flash = changes > 0 && tx.status === "validated" ? "motion-safe:animate-term-validated" : "";
  return (
    <li>
      <div key={changes} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm projector:py-1 projector:text-lg", flash)}>
        <TxStatusMark tx={tx} />
        <span className="w-14 shrink-0 text-term-fg-dim uppercase projector:hidden">{TX_TYPE_LABEL[tx.tx_type]}</span>
        <span className="min-w-0 flex-1 basis-48 projector:basis-56">
          <span className="block wrap-anywhere">{TX_KIND_LABEL[tx.kind]}</span>
          <span className="block text-term-fg-dim projector:text-base">
            <Party address={tx.from} names={names} />
            {tx.to && (
              <>
                {" -> "}
                <Party address={tx.to} names={names} />
              </>
            )}
          </span>
        </span>
        <span className="ml-auto flex items-baseline gap-3">
          {tx.amount && <Money amount={tx.amount} className="font-bold" />}
          <ViewTxLink hash={tx.hash} className="projector:text-base" />
        </span>
      </div>
    </li>
  );
}

function TxStatusMark({ tx }: { tx: LedgerTx }) {
  const label =
    tx.status === "failed" && tx.engine_result ? `${TX_STATUS_LABEL[tx.status]}: ${tx.engine_result}` : TX_STATUS_LABEL[tx.status];
  const tag = txTag(tx);
  return (
    <span className="inline-flex w-36 shrink-0 items-baseline gap-1 projector:w-auto" title={label}>
      <StatusTag tag={tx.status === "pending" ? { ...tag, word: null } : tag} size="sm" className="projector:text-base" />
      {tx.status === "pending" && <PendingBar tx={tx} className="projector:text-base" />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Party({ address, names }: { address: string; names: Map<string, string> }) {
  const name = names.get(address);
  return <ExplorerLink account={address} label={name} />;
}
