import type { ClaimStep } from "@/lib/claim/flow";
import { cn } from "@/lib/cn";

const STEPS = ["Claim", "Photo", "PIN", "Paying", "Paid"] as const;

const INDEX: Partial<Record<ClaimStep, number>> = {
  claim: 0,
  photo: 1,
  pin: 2,
  paying: 3,
  paid: 4,
};

/**
 * Where the Helper is: Claim, Photo, PIN, Paying, Paid, as five segments with
 * labels. The current one is bold and marked `aria-current="step"`; each label
 * also says "done" or "now" to screen readers, so color is never the only sign.
 * Nothing for the closed states (already claimed, time is up, locked).
 */
export function StepIndicator({ step, className }: { step: ClaimStep; className?: string }) {
  const current = INDEX[step];
  if (current === undefined) return null;
  return (
    <ol
      aria-label="Progress"
      className={cn(
        "grid grid-cols-5 gap-1.5 rounded-2xl border border-human-border bg-human-card p-4 shadow-human-sm",
        className,
      )}
    >
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className="flex min-w-0 flex-col gap-2"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 rounded-full",
              i <= current ? "bg-human-gradient" : "bg-human-border",
            )}
          />
          <span
            className={cn(
              "truncate text-[11px] uppercase tracking-[0.06em] sm:text-xs sm:tracking-[0.1em]",
              i === current
                ? "font-bold text-human-fg"
                : i < current
                  ? "font-semibold text-human-accent"
                  : "font-medium text-human-muted-fg",
            )}
          >
            {label}
            <span className="sr-only">{i < current ? ", done" : i === current ? ", now" : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
