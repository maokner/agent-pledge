"use client";

import { Badge } from "@/components/human/Badge";
import { PayAmount } from "@/components/human/PayAmount";
import { useHumanStats } from "@/lib/human-stats/use-human-stats";

const NUMBER = "text-5xl font-bold leading-none tracking-[-0.03em] tabular-nums lg:text-6xl";

/**
 * /human's dark stats band: open sub-tasks right now, money paid out to
 * Helpers today, and how many Helpers were paid today (lib/human-stats).
 * Refreshes every 30 seconds and when the tab is shown again. Shows "–"
 * until the first numbers arrive, and never breaks the page.
 */
export function StatsBand() {
  const stats = useHumanStats();
  return (
    <section
      aria-labelledby="stats-title"
      aria-busy={stats === null || undefined}
      className="relative overflow-hidden rounded-3xl bg-human-inverted bg-human-dots px-6 py-12 text-human-inverted-fg shadow-human-xl sm:px-10 lg:px-14 lg:py-16"
    >
      <div className="flex flex-col items-start gap-4">
        <Badge tone="inverted" dot="pulse">
          Live from the board
        </Badge>
        <h2
          id="stats-title"
          className="text-3xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-4xl"
        >
          Today on yo pledge
        </h2>
      </div>
      <dl className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 lg:mt-12">
        <Stat label="Open now">{stats === null ? <Dash /> : stats.openNow}</Stat>
        <Stat label="Paid out today">
          {stats === null ? (
            <Dash />
          ) : (
            <PayAmount amount={stats.paidOutToday} tone="inverted" className={NUMBER} />
          )}
        </Stat>
        <Stat label="Helpers paid today">{stats === null ? <Dash /> : stats.helpersPaid}</Stat>
      </dl>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-human-inverted-fg/15 pt-6">
      <dt className="text-sm font-medium uppercase tracking-[0.15em] text-human-inverted-fg/80">
        {label}
      </dt>
      <dd className={NUMBER}>{children}</dd>
    </div>
  );
}

function Dash() {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">Loading</span>
    </>
  );
}
