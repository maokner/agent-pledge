import type { ClaimView } from "@agent-pledge/shared";
import { explorerTxUrl, formatRlusd, shortHash } from "@/lib/format";
import { BoardLink, CARD, PRIMARY_BUTTON } from "./parts";

/**
 * "Paid $4.00" with a link to the payout transaction on the explorer
 * (PRD 2.1 step 13, 9.2 step 7), and what the money is, in plain words.
 */
export function PaidView({ view }: { view: ClaimView }) {
  const { payout } = view;
  const amount = formatRlusd(payout?.amount ?? view.subtask.price);
  return (
    <section className="flex flex-col gap-4" aria-labelledby="paid-title">
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-emerald-600 p-6 text-center text-white">
        <CheckIcon />
        <h2 id="paid-title" className="text-5xl font-extrabold tracking-tight">
          Paid {amount}
        </h2>
        <p className="text-lg text-emerald-50">Done: {view.subtask.description}</p>
      </div>

      <div className={CARD}>
        <h3 className="text-lg font-bold">What you got</h3>
        <p className="mt-1 text-lg text-zinc-700 dark:text-zinc-300">
          {amount} in RLUSD, a digital dollar meant to stay worth one US dollar. It was sent on the XRP Ledger test
          network, which is for demos, so it is test money and not real dollars.
        </p>
      </div>

      {payout && (
        <div className="flex flex-col gap-2">
          <a href={explorerTxUrl(payout.tx_hash)} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
            See the payment
            <ExternalIcon />
          </a>
          <p className="text-center text-base text-zinc-600 dark:text-zinc-400">
            Opens the XRP Ledger explorer. Transaction{" "}
            <span className="font-mono" title={payout.tx_hash}>
              {shortHash(payout.tx_hash)}
            </span>
          </p>
        </div>
      )}

      <BoardLink>Back to the board</BoardLink>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m7.5 12.5 3 3 6-6.5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
