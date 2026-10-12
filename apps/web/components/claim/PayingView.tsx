"use client";

import type { ClaimView } from "@/lib/contract";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/human/Badge";
import { buttonVariants } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { PayAmount } from "@/components/human/PayAmount";
import { Spinner } from "@/components/human/Spinner";
import { payingMessage } from "@/lib/claim/payout";
import { explorerTxUrl } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/**
 * The proof is in (the photo, or the right PIN) and the payment is on its way
 * (PRD 2.1 step 13). The page reloads the claim, and in photo mode asks the
 * server to pay, until it lands.
 */
export function PayingView({ view }: { view: ClaimView }) {
  const [since] = useState(() => Date.now());
  const now = useNow(1000);
  return (
    <Card
      as="section"
      aria-labelledby="paying-title"
      className="flex flex-col items-center gap-4 py-8 text-center lg:py-12"
    >
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-2xl bg-human-gradient text-human-accent-fg shadow-human-accent"
      >
        <Spinner className="size-8" />
      </span>
      <Badge size="sm" dot="pulse">
        {view.proof === "photo" ? "Photo received" : "PIN is right"}
      </Badge>
      <h2 id="paying-title" className="text-4xl font-bold leading-[1.1] tracking-[-0.02em]">
        Paying you{" "}
        <PayAmount amount={view.payout?.amount ?? view.subtask.price} size="md" tone="gradient" />
      </h2>
      <p className="text-lg leading-relaxed text-balance text-human-muted-fg" aria-live="polite">
        {payingMessage(now === null ? 0 : now - since)}
      </p>
      {view.payout && (
        <a
          href={view.payout.explorer_url ?? explorerTxUrl(view.payout.tx_hash)}
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
