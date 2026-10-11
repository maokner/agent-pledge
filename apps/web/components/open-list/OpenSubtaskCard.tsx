import type { OpenSubtaskSummary } from "@agent-pledge/shared";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/human/Badge";
import { TimeLeft, URGENT_MS } from "@/components/human/Countdown";
import { PayAmount } from "@/components/human/PayAmount";
import { cn } from "@/lib/cn";
import { openSubtaskLabel } from "@/lib/open-list/label";

/**
 * One open sub-task in the /human list: a single link to its claim page.
 * Visual weight: the pay, what to do, the place, then the time left.
 * `left` is milliseconds left on the server's clock, or null before the first tick.
 */
export function OpenSubtaskCard({ subtask, left }: { subtask: OpenSubtaskSummary; left: number | null }) {
  const urgent = left !== null && left < URGENT_MS;
  return (
    <Link
      href={`/c/${encodeURIComponent(subtask.claim_code)}`}
      aria-label={left === null ? undefined : openSubtaskLabel(subtask, left)}
      className={cn(
        "group/card block min-h-11 rounded-2xl border border-human-border bg-human-card p-5 shadow-human-md outline-none",
        "transition-all duration-200 ease-human",
        "focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2 focus-visible:ring-offset-human-bg",
        "hover:border-human-accent/30 hover:shadow-human-lg",
        "active:border-human-accent/40 active:shadow-human-sm motion-safe:active:scale-[0.99]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <PayAmount amount={subtask.price} size="lg" />
        {urgent && (
          <Badge tone="danger" size="sm" className="mt-2 shrink-0">
            Ending soon
          </Badge>
        )}
      </div>
      <p className="mt-2 text-lg font-semibold leading-snug tracking-[-0.01em] break-words">{subtask.description}</p>
      <p className="mt-1.5 flex items-start gap-2 text-base text-human-muted-fg">
        <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 break-words">{subtask.place}</span>
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-human-border pt-3">
        <span className="inline-flex items-center gap-2 text-base">
          <Clock aria-hidden="true" className={cn("size-4 shrink-0", urgent ? "text-human-danger" : "text-human-accent")} />
          <TimeLeft ms={left} />
          <span className="text-human-muted-fg">left</span>
        </span>
        <span aria-hidden="true" className="inline-flex items-center gap-1 text-base font-semibold text-human-accent">
          Claim
          <ArrowRight className="size-4 transition-transform duration-200 ease-human motion-safe:group-hover/card:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
