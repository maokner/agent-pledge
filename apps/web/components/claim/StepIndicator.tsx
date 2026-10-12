import type { ProofMode } from "@/lib/contract";
import { type ClaimStep, PROGRESS_STEPS, progressFor } from "@/lib/claim/flow";
import { cn } from "@/lib/cn";

const COLUMNS: Record<ProofMode, string> = { photo: "grid-cols-3", pin: "grid-cols-4" };

/**
 * Where the Helper is, as segments with labels: Claim, Proof, Paid (photo
 * mode) or Claim, Photo, PIN, Paid (PIN mode). The current one is bold and
 * marked `aria-current="step"`; while the payout is on its way the last
 * segment pulses and reads "in progress". Each label also says "done" or "now"
 * to screen readers, so color is never the only sign. Nothing for the closed
 * states (already claimed, time is up, locked).
 */
export function StepIndicator({
  step,
  proof,
  className,
}: {
  step: ClaimStep;
  proof: ProofMode;
  className?: string;
}) {
  const progress = progressFor(step, proof);
  if (!progress) return null;
  const { index: current, running } = progress;
  return (
    <ol
      aria-label="Progress"
      className={cn(
        "grid gap-1.5 rounded-2xl border border-human-border bg-human-card p-4 shadow-human-sm",
        COLUMNS[proof],
        className,
      )}
    >
      {PROGRESS_STEPS[proof].map((label, i) => (
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
              i === current && running && "motion-safe:animate-pulse",
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
            <span className="sr-only">
              {i < current ? ", done" : i === current ? (running ? ", in progress" : ", now") : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
