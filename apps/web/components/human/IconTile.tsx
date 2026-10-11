import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * A gradient tile with a white line icon, as on the bento cards.
 *
 * - size: `sm` 48px round, `md` 56px round (default, small cards),
 *   `lg` 72px to 88px rounded square (the featured card).
 *
 * Decorative: the card's text says what the icon shows. Scale it on card hover
 * from the parent, for example `motion-safe:group-hover/card:scale-110`.
 */
export const iconTileVariants = cva(
  "grid shrink-0 place-items-center bg-human-gradient text-human-accent-fg shadow-human-accent transition-transform duration-300 ease-human [&_svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "size-12 rounded-full [&_svg]:size-6",
        md: "size-14 rounded-full [&_svg]:size-7",
        lg: "size-18 rounded-3xl sm:size-22 [&_svg]:size-9 sm:[&_svg]:size-10",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export function IconTile({
  size,
  className,
  children,
}: VariantProps<typeof iconTileVariants> & { className?: string; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className={cn(iconTileVariants({ size }), className)}>
      {children}
    </span>
  );
}
