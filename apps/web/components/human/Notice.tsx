import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A message box: an icon and a title in the tone's color, the text in the
 * foreground color (so status never relies on color alone).
 *
 * - tone: `danger` (role="alert"), `warning`, `success`, `info`.
 */
export const noticeVariants = cva("flex gap-3 rounded-xl border p-4", {
  variants: {
    tone: {
      danger: "border-human-danger/25 bg-human-danger/5",
      warning: "border-human-warning/25 bg-human-warning/5",
      success: "border-human-success/25 bg-human-success/5",
      info: "border-human-accent/20 bg-human-accent/5",
    },
  },
  defaultVariants: { tone: "info" },
});

type Tone = NonNullable<VariantProps<typeof noticeVariants>["tone"]>;

const ICON: Record<Tone, LucideIcon> = {
  danger: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
};

const TONE_TEXT: Record<Tone, string> = {
  danger: "text-human-danger",
  warning: "text-human-warning",
  success: "text-human-success",
  info: "text-human-accent",
};

export type NoticeProps = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof noticeVariants> & {
    /** A short, bold first line in the tone's color. */
    title?: React.ReactNode;
    /** A button or link under the text, for example "Try again". */
    action?: React.ReactNode;
  };

/** An inline message: errors with a retry, warnings, confirmations. */
export function Notice({ tone, title, action, className, children, role, ...props }: NoticeProps) {
  const t = tone ?? "info";
  const Icon = ICON[t];
  return (
    <div role={role ?? (t === "danger" ? "alert" : "status")} className={cn(noticeVariants({ tone }), className)} {...props}>
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", TONE_TEXT[t])} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className={cn("text-lg font-semibold leading-snug", TONE_TEXT[t])}>{title}</p>}
        {children && <div className="text-base leading-relaxed text-human-fg">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
