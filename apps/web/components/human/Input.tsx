import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const FIELD_BASE = [
  "w-full rounded-xl border border-human-border bg-human-card px-4 text-human-fg shadow-human-sm",
  "transition-all duration-200 ease-human outline-none placeholder:text-human-muted-fg/50",
  "focus:border-human-accent focus:ring-2 focus:ring-human-ring focus:ring-offset-2 focus:ring-offset-human-bg",
  "aria-[invalid=true]:border-human-danger aria-[invalid=true]:focus:ring-human-danger",
  "disabled:cursor-not-allowed disabled:bg-human-muted disabled:shadow-none",
];

/**
 * Text input classes. Text is never under 16px, so iOS does not zoom the page.
 *
 * - size: `md` h-12 16px, `lg` h-14 18px (default), `code` h-20 with big,
 *   spaced, centered tabular digits (the PIN).
 *
 * `aria-invalid` turns the border red; pair it with a message.
 */
export const inputVariants = cva(FIELD_BASE, {
  variants: {
    size: {
      md: "h-12 text-base",
      lg: "h-14 text-lg",
      code: "h-20 pl-[0.6em] text-center font-sans text-5xl font-semibold tabular-nums tracking-[0.6em]",
    },
  },
  defaultVariants: { size: "lg" },
});

export type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>;

/** A text input. See `inputVariants`. */
export function Input({ size, className, ...props }: InputProps) {
  return <input className={cn(inputVariants({ size }), className)} {...props} />;
}

/** The textarea variant: same look as `Input`, at least three lines tall, 18px text. */
export function Textarea({ className, rows = 3, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(FIELD_BASE, "min-h-24 resize-y py-3 text-lg leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * A label above a control, with an optional "(optional)" tag and a hint below.
 * Wraps the control, so clicking the label focuses it.
 */
export function Field({
  label,
  optional = false,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  optional?: boolean;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="text-base font-semibold text-human-fg">
        {label}
        {optional && <span className="font-normal text-human-muted-fg"> (optional)</span>}
      </span>
      {children}
      {hint && <span className="text-sm text-human-muted-fg">{hint}</span>}
    </label>
  );
}
