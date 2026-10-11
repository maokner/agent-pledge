import type { ClaimView } from "@agent-pledge/shared";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { buttonVariants } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { PayAmount } from "@/components/human/PayAmount";
import { Spinner } from "@/components/human/Spinner";
import { explorerTxUrl } from "@/lib/format";

/** The PIN was right and the payment is on its way (PRD 2.1 step 13). The page polls until it lands. */
export function PayingView({ view }: { view: ClaimView }) {
  return (
    <Card as="section" aria-live="polite" aria-labelledby="paying-title" className="flex flex-col items-center gap-4 py-8 text-center lg:py-12">
      <span aria-hidden="true" className="grid size-16 place-items-center rounded-2xl bg-human-gradient text-human-accent-fg shadow-human-accent">
        <Spinner className="size-8" />
      </span>
      <Badge size="sm" dot="pulse">
        PIN is right
      </Badge>
      <h2 id="paying-title" className="text-4xl font-bold leading-[1.1] tracking-[-0.02em]">
        Paying you <PayAmount amount={view.payout?.amount ?? view.subtask.price} size="md" tone="gradient" />
      </h2>
      <p className="text-lg leading-relaxed text-human-muted-fg">Your money is on its way. This takes a few seconds.</p>
      {view.payout && (
        <a
          href={explorerTxUrl(view.payout.tx_hash)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "ghost", size: "sm", block: false })}
        >
          View payment
          <ExternalLink aria-hidden="true" className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </Card>
  );
}
