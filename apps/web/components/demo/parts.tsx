import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Bot,
  Check,
  ExternalLink,
  Flame,
  Landmark,
  PhoneCall,
  ScrollText,
  Sparkles,
  User,
  Vault,
} from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { cn } from "@/lib/cn";
import { roleName, typeLabel, type Role, type TxType } from "@/lib/demo/walkthrough";
import { shortHash } from "@/lib/format";

/** Small building blocks shared by the /demo sections. */

export const ROLE_ICON: Record<Role, LucideIcon> = {
  requester: PhoneCall,
  "local agent": Bot,
  vault: Vault,
  helper: User,
  treasury: Landmark,
};

const TYPE_ICON: Record<TxType, LucideIcon> = {
  Payment: Banknote,
  NFTokenMint: Sparkles,
  NFTokenCreateOffer: ScrollText,
  NFTokenAcceptOffer: Check,
  NFTokenBurn: Flame,
};

/** A section's heading block: a badge, a big title, and an optional lede. */
export function SectionHeading({
  id,
  badge,
  title,
  lede,
  className,
}: {
  id: string;
  badge: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-3xl flex-col items-start gap-4", className)}>
      <Badge dot>{badge}</Badge>
      <h2
        id={id}
        className="text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-balance sm:text-4xl lg:text-5xl"
      >
        {title}
      </h2>
      {lede && <p className="text-lg leading-relaxed text-human-muted-fg lg:text-xl">{lede}</p>}
    </div>
  );
}

/** A link to the public explorer, in a new tab. */
export function ExplorerLink({
  href,
  children = "View on explorer",
  className,
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-lg text-base font-semibold text-human-accent underline decoration-human-accent/30 underline-offset-4 outline-none transition-colors hover:decoration-current focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2 focus-visible:ring-offset-human-bg",
        className,
      )}
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** The one-word transaction type with its icon: Payment, Mint, Offer, Accept, Burn. */
export function TypePill({ type, className }: { type: TxType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <Badge
      tone="neutral"
      size="sm"
      className={cn("gap-1.5 normal-case tracking-[0.04em]", className)}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {typeLabel(type)}
    </Badge>
  );
}

/** Who acted: an icon and the role's name. */
export function RoleChip({ role, className }: { role: Role; className?: string }) {
  const Icon = ROLE_ICON[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-human-border bg-human-card px-2.5 py-1 text-sm font-medium text-human-fg",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 text-human-accent" />
      {roleName(role)}
    </span>
  );
}

/** A hash, address or NFT ID: short on the page, full in the title and for screen readers. */
export function Hash({
  value,
  full = false,
  className,
}: {
  value: string;
  full?: boolean;
  className?: string;
}) {
  return (
    <span
      title={value}
      className={cn(
        "font-mono text-sm tabular-nums",
        full ? "break-all" : "whitespace-nowrap",
        className,
      )}
    >
      {full ? (
        value
      ) : (
        <>
          <span aria-hidden="true">{shortHash(value)}</span>
          <span className="sr-only">{value}</span>
        </>
      )}
    </span>
  );
}

/** A definition row inside a ledger record: a label and a value. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-human-border py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
        {label}
      </dt>
      <dd className="min-w-0 text-sm leading-relaxed break-words">{children}</dd>
    </div>
  );
}
