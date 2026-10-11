import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { LiveDot } from "./LiveDot";

/**
 * A pill label: Inter 12px semibold, uppercase, wide tracking.
 *
 * - tone: `accent` (default), `neutral`, `success`, `warning`, `danger`,
 *   `inverted` (on a slate block).
 * - size: `md` px-5 py-2 (default), `sm` px-3 py-1.
 */
export const badgeVariants = cva(
  "inline-flex w-fit items-center gap-2 rounded-full border font-sans text-xs font-semibold uppercase leading-none tracking-[0.14em]",
  {
    variants: {
      tone: {
        accent: "border-human-accent/30 bg-human-accent/5 text-human-accent",
        neutral: "border-human-border bg-human-card text-human-muted-fg",
        success: "border-human-success/30 bg-human-success/5 text-human-success",
        warning: "border-human-warning/30 bg-human-warning/5 text-human-warning",
        danger: "border-human-danger/30 bg-human-danger/5 text-human-danger",
        inverted: "border-human-inverted-fg/20 bg-human-inverted-fg/10 text-human-inverted-fg",
      },
      size: {
        md: "px-5 py-2",
        sm: "px-3 py-1.5",
      },
    },
    defaultVariants: { tone: "accent", size: "md" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** A dot before the label in the badge's color: `true` steady, `"pulse"` live. */
    dot?: boolean | "pulse";
  };

/** A status or label pill, optionally with a (pulsing) dot. The text carries the meaning. */
export function Badge({ tone, size, dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <LiveDot tone="current" pulse={dot === "pulse"} className="size-1.5" />}
      {children}
    </span>
  );
}
