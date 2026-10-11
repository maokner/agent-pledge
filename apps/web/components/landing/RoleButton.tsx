import { cva } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * One of the two big landing buttons (docs/design/DIRECTION.md, "Landing").
 * Full width and stacked on phones, about 400 x 80 side by side from `sm` up.
 */
const roleButton = cva(
  [
    "group inline-flex h-16 w-full items-center justify-center gap-3 rounded-md px-6 sm:h-20 sm:flex-1 lg:max-w-[25rem] lg:gap-3.5",
    "text-[1.75rem] leading-none font-normal tracking-tight sm:text-3xl lg:text-4xl",
    "outline-none focus-visible:ring-2 focus-visible:ring-landing-ring focus-visible:ring-offset-2 focus-visible:ring-offset-landing-bg",
    "hover:opacity-90 motion-safe:transition motion-safe:active:scale-[0.98]",
  ],
  {
    variants: {
      tone: {
        human: "bg-landing-human-bg text-landing-human-fg",
        agent: "bg-landing-agent-bg text-landing-agent-fg",
      },
    },
  },
);

const iconColor = {
  human: "text-landing-human-icon",
  agent: "text-landing-agent-fg",
} as const;

type RoleButtonProps = {
  tone: keyof typeof iconColor;
  href: "/human" | "/board";
  icon: LucideIcon;
  children: React.ReactNode;
};

export function RoleButton({ href, icon: Icon, tone, children }: RoleButtonProps) {
  return (
    <Link href={href} className={roleButton({ tone })}>
      <Icon
        aria-hidden
        className={cn("size-6 shrink-0 lg:size-7", iconColor[tone])}
        strokeWidth={1.75}
      />
      <span>{children}</span>
    </Link>
  );
}
