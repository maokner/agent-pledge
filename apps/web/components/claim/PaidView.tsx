import type { ClaimView } from "@agent-pledge/shared";
import { Check, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { explorerTxUrl, formatRlusd } from "@/lib/format";
import { BoardLink } from "./parts";

/**
 * "Paid $4.00" and a "View payment" link that opens the payment on the explorer
 * in a new tab (PRD 2.1 step 13, 9.2 step 7). Nothing more: the helper does not
 * need to know how the money moved (PRD R7, docs/design/DIRECTION.md).
 */
export function PaidView({ view }: { view: ClaimView }) {
  const { payout } = view;
  const amount = formatRlusd(payout?.amount ?? view.subtask.price);
  return (
    <section className="flex flex-col gap-4" aria-labelledby="paid-title">
      <Card variant="inverted" className="flex flex-col items-center gap-5 py-12 text-center">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-human-gradient shadow-human-accent-lg">
          <Check className="size-8 text-human-accent-fg" strokeWidth={3} />
        </span>
        <h2
          id="paid-title"
          className="font-display text-[clamp(2.5rem,13vw,3.75rem)] leading-[1.1] tracking-[-0.02em] tabular-nums"
        >
          Paid {amount}
        </h2>
      </Card>

      {payout && (
        <a
          href={explorerTxUrl(payout.tx_hash)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "primary" })}
        >
          View payment
          <ExternalLink aria-hidden="true" className="size-5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}

      <BoardLink variant="ghost">Back to the board</BoardLink>
    </section>
  );
}
