import { ArrowRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { buttonVariants } from "@/components/human/Button";
import { cn } from "@/lib/cn";
import { durationLabel, EVIDENCE_URL, NFTS, TASK, TRANSACTIONS } from "@/lib/demo/walkthrough";
import { formatRlusd } from "@/lib/format";

const JUMPS = [
  { href: "#cast", label: "Who's who" },
  { href: "#money", label: "Where the money went" },
  { href: "#story", label: "The story" },
  { href: "#ledger", label: "Every transaction" },
  { href: "#nfts", label: "The NFTs" },
  { href: "#balances", label: "Final balances" },
  { href: "#gallery", label: "Screenshots" },
] as const;

/** The top of /demo: what happened, in one breath, with the numbers and the way in. */
export function DemoHero() {
  const stats = [
    { value: formatRlusd(TASK.price), label: "Task price" },
    { value: String(TRANSACTIONS.length), label: "Validated transactions" },
    { value: String(NFTS.length), label: "NFTs minted and burned" },
    { value: durationLabel(), label: "First to last ledger close" },
  ];

  return (
    <header className="flex flex-col gap-12 lg:gap-16">
      <div className="flex max-w-4xl flex-col items-start gap-6">
        <Badge dot>Recorded run · 11 Oct 2026 · XRPL Testnet</Badge>
        <h1 className="text-[clamp(2.75rem,7vw,5.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-balance">
          One phone call. One seat.{" "}
          <span className="text-human-gradient">Fifteen transactions.</span>
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-human-muted-fg lg:text-xl">
          The requester asked for “{TASK.description}” at {TASK.place} for {formatRlusd(TASK.price)}
          . An AI agent took the job, hired a student on Yik Yak, and the money moved only when the
          seat was real. Everything on this page was read back from the XRP Ledger: the money, the
          two NFTs, and the people who moved them.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
          <a href="#story" className={cn(buttonVariants({ variant: "primary", block: false }))}>
            Walk through it
            <ArrowRight
              aria-hidden="true"
              className="size-5 transition-transform duration-200 ease-human motion-safe:group-hover/button:translate-x-1"
            />
          </a>
          <a
            href={EVIDENCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "secondary", block: false }))}
          >
            Raw evidence on GitHub
            <ExternalLink aria-hidden="true" className="size-5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            style={{ animationDelay: `${i * 100}ms` }}
            className="flex flex-col-reverse gap-2 rounded-2xl border border-human-border bg-human-card p-5 shadow-human-md motion-safe:animate-human-fade-up sm:p-6"
          >
            <dt className="text-xs font-medium uppercase tracking-[0.15em] text-human-muted-fg">
              {stat.label}
            </dt>
            <dd className="text-3xl font-bold leading-none tracking-[-0.03em] whitespace-nowrap tabular-nums sm:text-4xl">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <nav aria-label="On this page" className="-mx-1 flex flex-wrap gap-2">
        {JUMPS.map((jump) => (
          <a
            key={jump.href}
            href={jump.href}
            className="inline-flex min-h-11 items-center rounded-full border border-human-border bg-human-card px-4 text-sm font-medium text-human-muted-fg outline-none transition-colors hover:border-human-accent/30 hover:text-human-fg focus-visible:ring-2 focus-visible:ring-human-ring focus-visible:ring-offset-2 focus-visible:ring-offset-human-bg"
          >
            {jump.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
