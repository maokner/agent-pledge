import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

/**
 * Button classes for the human side. Use them on <button> through `Button`, or
 * directly on a link or a <label> that wraps a file input:
 *
 *   <Link href="/board" className={buttonVariants({ variant: "secondary" })}>…</Link>
 *
 * - variant: `primary` (blue gradient, white Inter 600 at 18px), `secondary`
 *   (outlined), `ghost` (quiet text action).
 * - size: `lg` h-14 (default), `md` h-12, `sm` 44px-high text action (for ghost).
 * - block: `true` full width (default), `false` full width on phones and
 *   auto width from `sm` up.
 *
 * Hover lift is a desktop nicety only (Tailwind's `hover:` needs a pointer that
 * hovers); pressing scales to 0.98. Motion is skipped under reduced motion.
 * Focus shows a ring, also when a wrapped input inside a <label> has focus.
 */
export const buttonVariants = cva(
  [
    "group/button relative inline-flex select-none items-center justify-center gap-2.5 rounded-xl px-6 text-center font-sans",
    "transition-all duration-200 ease-human outline-none cursor-pointer disabled:cursor-not-allowed",
    "focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2 focus-visible:ring-offset-human-bg",
    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-human-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-human-bg",
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-human-gradient-button text-lg font-semibold text-human-accent-fg shadow-human-sm",
          "hover:brightness-110 hover:shadow-human-accent-lg motion-safe:hover:-translate-y-0.5",
          "active:shadow-human-accent motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]",
        ],
        secondary: [
          "border border-human-border bg-transparent text-lg font-semibold text-human-fg",
          "hover:border-human-accent/30 hover:bg-human-muted motion-safe:active:scale-[0.98]",
        ],
        ghost: [
          "px-3 text-base font-semibold text-human-muted-fg underline decoration-human-border underline-offset-4",
          "hover:text-human-fg hover:decoration-current",
        ],
      },
      size: {
        lg: "min-h-14",
        md: "min-h-12",
        sm: "min-h-11",
      },
      block: {
        true: "w-full",
        false: "w-full sm:w-auto",
      },
    },
    defaultVariants: { variant: "primary", size: "lg", block: true },
  },
);

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

/** Disabled but not busy: clearly inactive, label still readable (never just faded out). */
const INACTIVE: Record<Variant, string> = {
  primary:
    "bg-none! bg-human-muted text-human-fg/70 shadow-none hover:brightness-100 hover:shadow-none motion-safe:hover:translate-y-0 motion-safe:active:scale-100",
  secondary: "text-human-fg/70 hover:bg-transparent hover:border-human-border motion-safe:active:scale-100",
  ghost: "text-human-fg/60 hover:text-human-fg/60 no-underline",
};

/** Busy: keeps its look, shows a spinner, stops moving. */
const BUSY = "cursor-progress hover:brightness-100 motion-safe:hover:translate-y-0 motion-safe:active:scale-100";

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner and `busyLabel` (or the children), and blocks presses. */
    busy?: boolean;
    /** What the button says while busy, for example "Claiming…". */
    busyLabel?: React.ReactNode;
    /** An icon before the label, for example `<Camera className="size-6" />`. */
    icon?: React.ReactNode;
    /** An arrow after the label that slides right on hover (desktop nicety). */
    trailingArrow?: boolean;
  };

/** The human side's button. See `buttonVariants` for the variants. */
export function Button({
  variant,
  size,
  block,
  busy = false,
  busyLabel,
  icon,
  trailingArrow = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        buttonVariants({ variant, size, block }),
        busy && BUSY,
        disabled && !busy && INACTIVE[variant ?? "primary"],
        className,
      )}
      {...props}
    >
      {busy ? (
        <>
          <Spinner />
          {busyLabel ?? children}
        </>
      ) : (
        <>
          {icon}
          {children}
          {trailingArrow && (
            <ArrowRight
              aria-hidden="true"
              className="size-5 transition-transform duration-200 ease-human motion-safe:group-hover/button:translate-x-1"
            />
          )}
        </>
      )}
    </button>
  );
}
