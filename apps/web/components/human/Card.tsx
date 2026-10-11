import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Card classes for the human side.
 *
 * - variant: `default` (white, 1px border, md shadow), `muted` (flat slate-50
 *   fill; don't put small muted-fg text on it), `inverted` (deep slate block with
 *   light text and a faint dot grid, for one moment of emphasis), `featured`
 *   (2px blue gradient border, for the one item that matters most).
 * - padding: `md` p-5 on phones, p-6 from `sm` (default); `sm` p-4; `none`.
 */
export const cardVariants = cva("relative rounded-2xl", {
  variants: {
    variant: {
      default: "border border-human-border bg-human-card shadow-human-md",
      muted: "bg-human-muted",
      inverted: "overflow-hidden bg-human-inverted text-human-inverted-fg shadow-human-xl",
      featured: "bg-human-card",
    },
    padding: {
      md: "p-5 sm:p-6",
      sm: "p-4",
      none: "",
    },
  },
  defaultVariants: { variant: "default", padding: "md" },
});

export type CardProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof cardVariants> & {
    /** Render as another element, for example "section" with an aria-labelledby. */
    as?: "div" | "section" | "article" | "li";
  };

/**
 * A white card (or a muted, inverted or featured one). `className` goes on the
 * card's content box, so layout classes like `flex flex-col gap-4` work for
 * every variant.
 */
export function Card({
  variant,
  padding,
  as: Tag = "div",
  className,
  children,
  ...props
}: CardProps) {
  if (variant === "featured") {
    // A gradient outer box with a white inner box: a 2px gradient border.
    return (
      <Tag className="rounded-2xl bg-human-gradient p-0.5 shadow-human-accent" {...props}>
        <div className={cn(cardVariants({ variant, padding }), "rounded-[14px]", className)}>
          {children}
        </div>
      </Tag>
    );
  }
  // The dot grid is a background image on top of the slate color. It is added
  // outside cn(), which would treat it as a second background color and drop one.
  const dots = variant === "inverted" ? " bg-human-dots" : "";
  return (
    <Tag className={cn(cardVariants({ variant, padding }), className) + dots} {...props}>
      {children}
    </Tag>
  );
}

/** A card title: Inter 600, tight tracking. */
export function CardTitle({
  as: Tag = "h2",
  className,
  ...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3" | "p" }) {
  return (
    <Tag
      className={cn("text-xl font-semibold leading-snug tracking-[-0.01em]", className)}
      {...props}
    />
  );
}
