"use client";

import type { ClaimTx, ClaimView } from "@/lib/contract";
import { ExternalLink, Fingerprint, Landmark, Ticket, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/human/Badge";
import { Card } from "@/components/human/Card";
import { LiveDot } from "@/components/human/LiveDot";
import {
  escrowText,
  holderText,
  isMine,
  shouldPollLedger,
  txLabel,
  type TxLabelContext,
} from "@/lib/claim/ledger";
import { cn } from "@/lib/cn";
import { shortHash } from "@/lib/format";

const LABEL = "text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg";
const NEW_TAB = <span className="sr-only">(opens in a new tab)</span>;

/**
 * "On the ledger": the sub-task NFT and who holds it, the money the vault
 * holds, the proof photo's fingerprint once it is in, and every transaction of
 * the sub-task with its status and an explorer link. It shows in every state;
 * useClaim keeps it fresh (every 3 s from the claim until the NFT is burned),
 * and rows that arrive while the page is open slide in.
 */
export function LedgerPanel({ view, className }: { view: ClaimView; className?: string }) {
  const live = shouldPollLedger(view);
  const context: TxLabelContext = { mine: isMine(view), price: view.subtask.price };
  // The rows already there on first paint stay still; later ones animate in.
  const [initial] = useState(() => new Set(view.transactions.map((tx) => tx.hash)));

  return (
    <Card
      as="section"
      aria-labelledby="ledger-title"
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="ledger-title" className="text-xl font-semibold leading-snug tracking-[-0.01em]">
            On the ledger
          </h2>
          {live && (
            <Badge size="sm" dot="pulse" className="shrink-0">
              Live
            </Badge>
          )}
        </div>
        <p className="text-base leading-relaxed text-human-muted-fg">
          Every step is public on the XRPL.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-human-border border-y border-human-border">
        <Fact icon={Ticket}>
          {view.nft ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-base font-semibold">
                  NFT <span className="tabular-nums">{shortHash(view.nft.id)}</span>
                </p>
                <ExternalTextLink href={view.nft.explorer_url} strong>
                  View NFT
                </ExternalTextLink>
              </div>
              <p className="text-base text-human-muted-fg">
                {holderText(view.nft.holder, view.state)}
              </p>
              {view.nft.parent_nft_id && view.nft.parent_explorer_url && (
                <ExternalTextLink href={view.nft.parent_explorer_url} className="mt-1 text-sm">
                  Part of task NFT{" "}
                  <span className="tabular-nums">{shortHash(view.nft.parent_nft_id)}</span>
                </ExternalTextLink>
              )}
            </>
          ) : (
            <>
              <p className="text-base font-semibold">NFT</p>
              <p className="text-base text-human-muted-fg">Not minted yet</p>
            </>
          )}
        </Fact>

        {view.escrow && (
          <Fact icon={Landmark}>
            <ExternalTextLink
              href={view.escrow.vault_explorer_url}
              className="text-base font-semibold text-human-fg"
            >
              {escrowText(view)}
            </ExternalTextLink>
            <p className="text-sm text-human-muted-fg">
              Vault <span className="tabular-nums">{shortHash(view.escrow.vault_address)}</span>
            </p>
          </Fact>
        )}

        {view.proof_sha256 && (
          <Fact icon={Fingerprint}>
            <p className="text-base font-semibold">
              Photo fingerprint <span className="tabular-nums">{shortHash(view.proof_sha256)}</span>
            </p>
            <p className="text-sm text-human-muted-fg">written into the payout memo</p>
          </Fact>
        )}
      </ul>

      <div className="flex flex-col gap-1">
        <h3 className={LABEL}>Transactions</h3>
        {view.transactions.length === 0 ? (
          <p className="py-2 text-base text-human-muted-fg">Nothing on the ledger yet.</p>
        ) : (
          <ol aria-live="polite" aria-relevant="additions" className="-mx-2 flex flex-col">
            {view.transactions.map((tx) => (
              <TxRow
                key={tx.hash}
                tx={tx}
                label={txLabel(tx, context)}
                arrived={!initial.has(tx.hash)}
              />
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

/** One fact about the sub-task on the ledger: a small icon tile and its lines. */
function Fact({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3.5">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-human-accent/10 text-human-accent"
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 break-words">{children}</div>
    </li>
  );
}

/** A link that opens the explorer in a new tab, with the external-link icon. */
function ExternalTextLink({
  href,
  strong = false,
  className,
  children,
}: {
  href: string;
  strong?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md text-human-accent underline-offset-4 transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2",
        strong ? "text-base font-semibold" : "font-medium",
        className,
      )}
    >
      <span>{children}</span>
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
      {NEW_TAB}
    </a>
  );
}

const STATUS_TEXT: Record<ClaimTx["status"], string> = {
  pending: "Pending",
  validated: "Done",
  failed: "Failed",
};

/** One transaction: a status dot, the plain label, the status or time, and the explorer link. */
function TxRow({ tx, label, arrived }: { tx: ClaimTx; label: string; arrived: boolean }) {
  const time = tx.status === "validated" ? clock(tx.validated_at ?? tx.submitted_at) : null;
  return (
    <li className={cn("rounded-lg", arrived && "motion-safe:animate-human-row-in")}>
      <a
        href={tx.explorer_url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5 transition-colors duration-200 hover:bg-human-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-human-ring"
      >
        {/* Each side piece sits on the label's first line (22px), so a wrapped label still lines up. */}
        <span className="flex h-[22px] shrink-0 items-center">
          <StatusDot status={tx.status} />
        </span>
        <span className="min-w-0 flex-1 text-base font-medium leading-[22px]">{label}</span>
        <span
          className={cn(
            "shrink-0 text-sm leading-[22px] tabular-nums",
            tx.status === "failed"
              ? "font-semibold text-human-danger"
              : tx.status === "pending"
                ? "font-medium text-human-accent"
                : "text-human-muted-fg",
          )}
        >
          {time ?? STATUS_TEXT[tx.status]}
          {time && <span className="sr-only">, {STATUS_TEXT[tx.status]}</span>}
        </span>
        <span className="flex h-[22px] shrink-0 items-center">
          <ExternalLink
            aria-hidden="true"
            className="size-4 text-human-muted-fg transition-colors duration-200 group-hover:text-human-accent"
          />
        </span>
        {NEW_TAB}
      </a>
    </li>
  );
}

/** Pending pulses in the accent, done is solid green, failed is solid red. The text next to it says the same. */
function StatusDot({ status }: { status: ClaimTx["status"] }) {
  if (status === "pending") return <LiveDot tone="accent" className="size-2.5" />;
  return (
    <LiveDot tone={status === "failed" ? "danger" : "success"} pulse={false} className="size-2.5" />
  );
}

/** "2:04 PM" in the phone's own time. */
function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
