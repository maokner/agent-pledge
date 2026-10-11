import type { OpenSubtaskSummary } from "@/lib/contract";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/human/Badge";
import { TimeLeft, URGENT_MS } from "@/components/human/Countdown";
import { IconTile } from "@/components/human/IconTile";
import { PayAmount } from "@/components/human/PayAmount";
import { cn } from "@/lib/cn";
import { openSubtaskLabel } from "@/lib/open-list/label";
import { SubtaskIcon } from "./SubtaskIcon";

/**
 * One open sub-task in the /human bento grid: a single link to its claim page.
 * Visual weight: the pay, what to do, the place, then the time left.
 * `left` is milliseconds left on the server's clock, or null before the first tick.
 *
 * `featured` is the big card (the highest pay): a larger icon tile, bigger
 * type, a corner glow and a "Claim it" link at the bottom. On desktop every
 * card lifts on hover, with a deeper shadow, a faint accent wash and a
 * slightly larger icon; nothing depends on hover.
 */
export function OpenSubtaskCard({
  subtask,
  left,
  featured = false,
}: {
  subtask: OpenSubtaskSummary;
  left: number | null;
  featured?: boolean;
}) {
  const urgent = left !== null && left < URGENT_MS;
  return (
    <Link
      href={`/c/${encodeURIComponent(subtask.claim_code)}`}
      aria-label={left === null ? undefined : openSubtaskLabel(subtask, left)}
      className={cn(
        "group/card relative flex h-full min-h-11 flex-col overflow-hidden rounded-2xl border border-human-border bg-human-card shadow-human-md outline-none",
        "transition-all duration-300 ease-human",
        "focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2 focus-visible:ring-offset-human-bg",
        "hover:border-human-accent/25 hover:shadow-human-xl motion-safe:hover:-translate-y-1",
        "active:shadow-human-md motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99]",
        featured ? "p-6 sm:p-8 lg:p-12" : "p-6 lg:p-8",
      )}
    >
      {/* Decoration: the featured card's corner glow, and the accent wash that fades in on hover. */}
      {featured && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-human-corner-glow"
        />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-human-card-glow opacity-0 transition-opacity duration-300 ease-human group-hover/card:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-3">
        <IconTile size={featured ? "lg" : "md"} className="motion-safe:group-hover/card:scale-110">
          <SubtaskIcon description={subtask.description} />
        </IconTile>
        <div className="flex flex-wrap justify-end gap-2">
          {featured && <Badge size="sm">Top pay</Badge>}
          {urgent && (
            <Badge tone="danger" size="sm">
              Ending soon
            </Badge>
          )}
        </div>
      </div>

      <PayAmount
        amount={subtask.price}
        size={featured ? "xl" : "md"}
        className={cn(
          "relative",
          featured ? "mt-8 text-5xl sm:text-6xl lg:mt-10 lg:text-7xl" : "mt-6",
        )}
      />
      <p
        className={cn(
          "relative font-semibold tracking-[-0.01em] break-words",
          featured
            ? "mt-3 text-xl leading-snug sm:text-2xl lg:text-3xl lg:leading-tight"
            : "mt-2 text-lg leading-snug",
        )}
      >
        {subtask.description}
      </p>
      <p
        className={cn(
          "relative mt-2 flex items-start gap-2 text-human-muted-fg",
          featured ? "text-base sm:text-lg" : "text-base",
        )}
      >
        <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0" />
        <span className="min-w-0 break-words">{subtask.place}</span>
      </p>

      <div className={cn("relative mt-auto", featured ? "pt-8 lg:pt-12" : "pt-6")}>
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            !featured && "border-t border-human-border pt-4",
          )}
        >
          <span
            className={cn("inline-flex items-center gap-2", featured ? "text-lg" : "text-base")}
          >
            <Clock
              aria-hidden="true"
              className={cn("size-4 shrink-0", urgent ? "text-human-danger" : "text-human-accent")}
            />
            <TimeLeft ms={left} />
            <span className="text-human-muted-fg">left</span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex items-center gap-1.5 font-semibold text-human-accent",
              featured ? "text-lg" : "text-base",
            )}
          >
            {featured ? "Claim it" : "Claim"}
            <ArrowRight className="size-4 transition-transform duration-200 ease-human motion-safe:group-hover/card:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}
