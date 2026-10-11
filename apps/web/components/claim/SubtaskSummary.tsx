import type { ClaimView } from "@agent-pledge/shared";
import { Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { Card } from "@/components/human/Card";
import { TimeLeft } from "@/components/human/Countdown";
import { PayAmount } from "@/components/human/PayAmount";
import { cn } from "@/lib/cn";

/**
 * The sub-task: the pay in big type, what to do, the place, and the time left
 * (PRD 9.2 step 1). `left` is milliseconds left on the server's clock, or null
 * before the first tick. The full card (with a gradient border) is for the
 * Claim step; `compact` is the reminder on the later steps.
 */
export function SubtaskSummary({ view, left, compact = false }: { view: ClaimView; left: number | null; compact?: boolean }) {
  const { subtask } = view;
  const live = view.state === "open" || view.state === "claimed_by_you";
  return (
    <Card as="section" variant={compact ? "default" : "featured"} aria-label="The sub-task">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
          {live ? "You get" : "Pay"}
        </p>
        {view.state === "open" && (
          <Badge size="sm" dot="pulse">
            Open
          </Badge>
        )}
        {view.state === "claimed_by_you" && (
          <Badge size="sm" tone="success" dot>
            Yours
          </Badge>
        )}
      </div>
      <PayAmount
        amount={subtask.price}
        size={compact ? "md" : "hero"}
        tone={compact ? "default" : "gradient"}
        className={compact ? "mt-1" : "mt-2"}
      />
      <h2 className={cn("font-semibold leading-snug tracking-[-0.01em]", compact ? "mt-2 text-lg" : "mt-4 text-xl")}>
        {subtask.description}
      </h2>
      <dl className={cn("flex flex-col gap-3 border-t border-human-border text-base", compact ? "mt-3 pt-3" : "mt-5 pt-4")}>
        <Detail icon={<MapPin className="size-5" />} term="Where">
          <span className="font-medium">{subtask.place}</span>
        </Detail>
        {live ? (
          <Detail icon={<Clock className="size-5" />} term="Time left">
            <TimeLeft ms={left} className="text-lg" />{" "}
            <span className="text-human-muted-fg">of {subtask.time_limit_minutes} min</span>
          </Detail>
        ) : (
          <Detail icon={<Clock className="size-5" />} term="Time limit">
            <span className="font-medium">{subtask.time_limit_minutes} min</span>
          </Detail>
        )}
      </dl>
    </Card>
  );
}

function Detail({ icon, term, children }: { icon: React.ReactNode; term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 text-human-accent">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <dt className="font-mono text-xs uppercase tracking-[0.15em] text-human-muted-fg">{term}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}
