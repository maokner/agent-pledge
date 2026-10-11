import type { RlusdAmount } from "@/lib/contract";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { formatRlusd } from "@/lib/format";

/**
 * The pay, as dollars ("$4.00"), in Inter bold with tight tracking: the
 * biggest thing on a human screen.
 *
 * - size: `hero` (48 to 72px, scales with the phone's width so "$120.00" still
 *   fits at 360px), `xl` 60px, `lg` 48px, `md` 36px (default), `sm` 24px.
 * - tone: `default` (foreground), `gradient` (blue gradient text, `hero`/`xl`
 *   only: it needs 24px+), `inverted` (on a slate block).
 */
export const payAmountVariants = cva(
  "inline-block font-sans font-bold leading-[1.05] tracking-[-0.02em] tabular-nums",
  {
    variants: {
      size: {
        hero: "text-[clamp(3rem,17vw,4.5rem)]",
        xl: "text-6xl",
        lg: "text-5xl",
        md: "text-4xl",
        sm: "text-2xl",
      },
      tone: {
        default: "text-human-fg",
        gradient: "text-human-gradient",
        inverted: "text-human-inverted-fg",
      },
    },
    defaultVariants: { size: "md", tone: "default" },
  },
);

export type PayAmountProps = Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof payAmountVariants> & {
    /** The amount as the API sends it, for example "4" or "4.00". */
    amount: RlusdAmount;
  };

/** A dollar amount, big and bold. */
export function PayAmount({ amount, size, tone, className, ...props }: PayAmountProps) {
  return (
    <span className={cn(payAmountVariants({ size, tone }), className)} {...props}>
      {formatRlusd(amount)}
    </span>
  );
}
