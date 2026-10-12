import { ArrowRight, ChevronDown } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/cn";
import {
  amountLabel,
  chapterOf,
  clockLabel,
  elapsedLabel,
  nftName,
  TRANSACTIONS,
  TX_COPY,
  txNumber,
  type LedgerTx,
} from "@/lib/demo/walkthrough";
import { ExplorerLink, Fact, Hash, RoleChip, SectionHeading, TypePill } from "./parts";

/**
 * Every transaction of the run, in ledger order, as a timeline you can scroll:
 * who signed, what moved, which NFT, when, and a link to the explorer. The
 * full ledger record (hash, offer, memos, signature) is one tap away under
 * each one.
 */
export function TxTimeline() {
  return (
    <section
      id="ledger"
      aria-labelledby="ledger-title"
      className="scroll-mt-28 flex flex-col gap-10 lg:gap-14"
    >
      <SectionHeading
        id="ledger-title"
        badge="Every transaction"
        title={
          <>
            All {TRANSACTIONS.length}, <span className="text-human-gradient">in order</span>
          </>
        }
        lede="Read back from the XRPL Testnet, each validated with tesSUCCESS and signed by the account that acted. Times count from the first ledger close."
      />
      <ol className="relative flex flex-col gap-6 pl-12 before:absolute before:top-4 before:bottom-4 before:left-[1.1875rem] before:w-0.5 before:bg-human-border sm:pl-16 sm:before:left-[1.4375rem]">
        {TRANSACTIONS.map((tx, i) => {
          const chapter = chapterOf(tx);
          const previous = TRANSACTIONS[i - 1];
          const newChapter = i === 0 || chapterOf(previous!) !== chapter;
          return (
            <Fragment key={tx.hash}>
              {newChapter && (
                <li
                  aria-hidden="true"
                  className="relative -ml-12 flex items-center gap-3 pt-2 sm:-ml-16"
                >
                  <span className="grid size-10 place-items-center rounded-full border-2 border-human-accent/30 bg-human-bg sm:size-12">
                    <span className="size-2.5 rounded-full bg-human-gradient" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-human-accent">
                    {chapter ? `${chapter.kicker} · ${chapter.title}` : "Setup"}
                  </span>
                </li>
              )}
              <TxItem tx={tx} />
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}

function TxItem({ tx }: { tx: LedgerTx }) {
  const n = txNumber(tx);
  const amount = amountLabel(tx);
  const copy = TX_COPY[tx.kind];
  return (
    <li id={`tx-${n}`} className="relative scroll-mt-28">
      <span
        aria-hidden="true"
        className="absolute top-5 -left-12 grid size-10 place-items-center rounded-full border-2 border-human-border bg-human-card text-sm font-bold tabular-nums text-human-fg shadow-human-sm sm:-left-16 sm:size-12 sm:text-base"
      >
        {n}
      </span>
      <article
        aria-labelledby={`tx-${n}-title`}
        className="flex flex-col gap-4 rounded-2xl border border-human-border bg-human-card p-5 shadow-human-md transition-shadow duration-300 hover:shadow-human-lg sm:p-6"
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <TypePill type={tx.type} />
            <h3
              id={`tx-${n}-title`}
              className="text-xl font-semibold leading-snug tracking-[-0.01em]"
            >
              {copy.title}
            </h3>
          </div>
          <p className="flex shrink-0 items-baseline gap-3 sm:flex-col sm:items-end sm:gap-0.5">
            <span className="text-2xl font-bold leading-none tracking-[-0.02em] tabular-nums">
              {elapsedLabel(tx.closeTime)}
            </span>
            <span className="text-sm tabular-nums text-human-muted-fg">
              {clockLabel(tx.closeTime)}
            </span>
          </p>
        </header>

        <p className="text-base leading-relaxed text-human-muted-fg">{copy.detail}</p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-human-border pt-4">
          <span className="flex items-center gap-2">
            <RoleChip role={tx.signerRole} />
            {tx.destinationRole && (
              <>
                <ArrowRight aria-hidden="true" className="size-4 text-human-muted-fg" />
                <span className="sr-only">to</span>
                <RoleChip role={tx.destinationRole} />
              </>
            )}
          </span>
          {amount && (
            <span className="text-xl font-bold tabular-nums tracking-[-0.02em]">{amount}</span>
          )}
          {tx.nftId && (
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="font-medium text-human-muted-fg">{nftName(tx.nftId)}</span>
              <Hash value={tx.nftId} />
            </span>
          )}
          <span className="text-sm text-human-muted-fg">
            Ledger <span className="tabular-nums">{tx.ledgerIndex}</span>
          </span>
          <ExplorerLink href={tx.explorerUrl} className="ml-auto min-h-0" />
        </div>

        <details className="group/record rounded-xl bg-human-muted">
          <summary
            className={cn(
              "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 text-sm font-semibold text-human-fg outline-none select-none",
              "marker:hidden [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-human-ring",
            )}
          >
            Ledger record
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-open/record:rotate-180"
            />
          </summary>
          <dl className="px-4 pb-4">
            <Fact label="Hash">
              <Hash value={tx.hash} full />
            </Fact>
            <Fact label="Signer">
              <Hash value={tx.signer} full />
            </Fact>
            {tx.destination && (
              <Fact label="Destination">
                <Hash value={tx.destination} full />
              </Fact>
            )}
            {tx.deliveredAmount && <Fact label="Delivered">{tx.deliveredAmount}</Fact>}
            {tx.amount && <Fact label="Amount">{tx.amount}</Fact>}
            {tx.nftId && (
              <Fact label="NFT">
                <Hash value={tx.nftId} full />
              </Fact>
            )}
            {tx.offerId && (
              <Fact label="Offer">
                <Hash value={tx.offerId} full />
              </Fact>
            )}
            {tx.uri && (
              <Fact label="URI">
                <span className="break-all">{tx.uri}</span>
              </Fact>
            )}
            <Fact label="Memos">
              <ul className="flex flex-col gap-1">
                {tx.memos.map((memo) => (
                  <li key={memo.type} className="font-mono text-xs break-all">
                    {memo.type} = {memo.data}
                  </li>
                ))}
              </ul>
            </Fact>
            <Fact label="Ledger">
              <span className="tabular-nums">
                {tx.ledgerIndex} · CTID {tx.ctid} · closed {tx.closeTime}
              </span>
            </Fact>
            <Fact label="Sequence · Fee">
              <span className="tabular-nums">
                {tx.sequence} · {tx.fee} · flags {tx.flags}
              </span>
            </Fact>
            <Fact label="Result">
              <span className="font-mono text-sm text-human-success">{tx.result}</span>
            </Fact>
            <Fact label="Signing key">
              <Hash value={tx.signingPubKey} full />
            </Fact>
            <Fact label="Signature">
              <Hash value={tx.signature} full />
            </Fact>
          </dl>
        </details>
      </article>
    </li>
  );
}
