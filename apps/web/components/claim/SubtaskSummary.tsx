import type { ClaimView } from "@/lib/contract";
import { Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { Card } from "@/components/human/Card";
import { TimeLeft } from "@/components/human/Countdown";
import { IconTile } from "@/components/human/IconTile";
import { PayAmount } from "@/components/human/PayAmount";
import { SubtaskIcon } from "@/components/open-list/SubtaskIcon";
import { cn } from "@/lib/cn";

const LABEL = "text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg";

/**
 * The sub-task: an icon tile, the pay in big type, what to do, the place, and
 * the time left (PRD 9.2 step 1). `left` is milliseconds left on the server's
 * clock, or null before the first tick. The full card (with a gradient border)
 * is for the Claim step. `compact` is the reminder on the later steps: smaller
 * on phones, where the step's form matters most, and full size on desktop,
 * where it fills the left column.
 */
export function SubtaskSummary({ view, left, compact = false }: { view: ClaimView; left: number | null; compact?: boolean }) {
  const { subtask } = view;
  const live = view.state === "open" || view.state === "claimed_by_you";
  return (
    <Card
      as="section"
      variant={compact ? "default" : "featured"}
      padding="none"
      aria-label="The sub-task"
      className={cn("overflow-hidden", compact ? "p-5 sm:p-6 lg:p-10" : "p-6 sm:p-8 lg:p-10")}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-human-corner-glow" />

      <div className="relative flex items-start justify-between gap-3">
        <IconTile
          size={compact ? "sm" : "lg"}
          className={cn(compact && "lg:size-22 lg:rounded-3xl lg:[&_svg]:size-10")}
        >
          <SubtaskIcon description={subtask.description} />
        </IconTile>
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

      <p className={cn("relative", LABEL, compact ? "mt-4 lg:mt-8" : "mt-6 lg:mt-8")}>{live ? "You get" : "Pay"}</p>
      <PayAmount
        amount={subtask.price}
        size={compact ? "md" : "hero"}
        tone={compact ? "default" : "gradient"}
        className="relative mt-1 lg:text-7xl"
      />
      <h2
        className={cn(
          "relative font-semibold tracking-[-0.01em] break-words",
          compact ? "mt-2 text-lg leading-snug lg:mt-4 lg:text-2xl" : "mt-4 text-xl leading-snug lg:text-2xl",
        )}
      >
        {subtask.description}
      </h2>
      <dl
        className={cn(
          "relative flex flex-col gap-3 border-t border-human-border text-base sm:flex-row sm:gap-10",
          compact ? "mt-3 pt-3 lg:mt-8 lg:pt-6" : "mt-5 pt-4 lg:mt-8 lg:pt-6",
        )}
      >
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
    <div className="flex min-w-0 items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 text-human-accent">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <dt className={LABEL}>{term}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}
