import { cn } from "@/lib/cn";

export type DotTone = "accent" | "success" | "warning" | "danger" | "current";

const TONE: Record<DotTone, string> = {
  accent: "bg-human-accent",
  success: "bg-human-success",
  warning: "bg-human-warning",
  danger: "bg-human-danger",
  current: "bg-current",
};

/**
 * A small dot that pulses (2s, scale 1 to 1.3) to say "live". It stands still
 * under reduced motion, and with `pulse={false}`. Decorative unless `label` is
 * given; never let it be the only sign of a state.
 */
export function LiveDot({
  tone = "accent",
  pulse = true,
  label,
  className,
}: {
  tone?: DotTone;
  pulse?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        TONE[tone],
        pulse && "motion-safe:animate-human-pulse",
        className,
      )}
    />
  );
}
