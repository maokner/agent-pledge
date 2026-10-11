import { cn } from "@/lib/cn";

/**
 * A determinate progress bar: a blue gradient fill on a muted track.
 * `value` is 0 to 1. `label` names it for screen readers ("Sending your photo").
 */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-3 w-full overflow-hidden rounded-full bg-human-muted", className)}
    >
      <div
        className="h-full rounded-full bg-human-gradient transition-[width] duration-200 ease-human"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
