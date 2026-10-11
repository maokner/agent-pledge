"use client";

import { CloudOff, RotateCw } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { Button } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { LiveDot } from "@/components/human/LiveDot";
import { Notice } from "@/components/human/Notice";
import { cn } from "@/lib/cn";
import { msLeft } from "@/lib/claim/clock";
import { bentoCells, type BentoCell } from "@/lib/open-list/bento";
import type { OpenListState } from "@/lib/open-list/feed";
import { useOpenList } from "@/lib/open-list/use-open-list";
import { useNow } from "@/lib/use-now";
import { OpenSubtaskCard } from "./OpenSubtaskCard";

/** The first list fades up one card at a time, this far apart. */
const STAGGER_MS = 100;
/** Cards further down start with the last one that staggers. */
const MAX_STAGGERED = 6;

/** Static class names per span, so Tailwind sees every one. */
const MD_SPAN: Record<BentoCell["md"], string> = { 1: "", 2: "md:col-span-2" };
const LG_SPAN: Record<BentoCell["lg"], string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3" };
const LG_ROWS: Record<BentoCell["lgRows"], string> = { 1: "", 2: "lg:row-span-2" };

/** The bento grid: 1 column on phones, 2 on md, 3 on lg. */
const GRID = "grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6";

/**
 * /human's title and bento grid of open sub-tasks a Helper can claim. The
 * highest-paying one gets the big featured card; the rest follow soonest
 * deadline first (lib/open-list/bento.ts). Each card opens its claim page. The
 * list refreshes itself (useOpenList) and drops a sub-task the second its time
 * runs out, on the server's clock.
 */
export function OpenList() {
  const { state, online, retry } = useOpenList();
  const now = useNow(1000);

  return (
    <section aria-labelledby="open-list-title" className="relative flex flex-col gap-8 lg:gap-12">
      <TitleDecoration />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <h1
            id="open-list-title"
            className="text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl"
          >
            Open <span className="text-human-gradient">tasks</span>
          </h1>
          <FreshnessBadge state={state} online={online} />
        </div>
        <p className="max-w-2xl text-lg leading-relaxed text-human-muted-fg sm:text-xl">
          Do a quick task nearby and get paid when it’s done.
        </p>
      </div>

      {/* Says when new sub-tasks arrive; never the countdown ticks. Always in the page, so it is heard. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {state.status === "ready" ? state.announcement : null}
      </p>

      {state.status === "loading" && <LoadingGrid />}
      {state.status === "error" && (
        <Notice
          tone="danger"
          title="Open tasks did not load"
          className="max-w-2xl"
          action={
            <Button
              variant="secondary"
              block={false}
              onClick={retry}
              icon={<RotateCw aria-hidden="true" className="size-5" />}
            >
              Try again
            </Button>
          }
        >
          {online ? "Check your signal. We keep trying in the background." : "You’re offline. We’ll try again when you’re back."}
        </Notice>
      )}
      {state.status === "ready" && <ReadyGrid state={state} now={now} online={online} />}
    </section>
  );
}

function ReadyGrid({
  state,
  now,
  online,
}: {
  state: Extract<OpenListState, { status: "ready" }>;
  now: number | null;
  online: boolean;
}) {
  // Before the clock's first tick, show the list as loaded (at the server time
  // of the last load: nothing has run out yet); after, drop what has run out.
  const serverNow = now === null ? null : now + state.offsetMs;
  const cells = bentoCells(state.subtasks, serverNow ?? -Infinity);
  const entering = new Set(state.entering);

  return (
    <div className="flex flex-col gap-5">
      {state.failures > 0 && (
        <p className="flex items-start gap-2 text-base text-human-muted-fg">
          <CloudOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {online ? "Can’t refresh right now. Showing the last list while we try again." : "You’re offline. Showing the last list."}
        </p>
      )}
      {cells.length === 0 ? (
        <EmptyList />
      ) : (
        <ul aria-labelledby="open-list-title" className={GRID}>
          {cells.map((cell, index) => {
            const { subtask } = cell;
            const enters = entering.has(subtask.claim_code);
            return (
              <li
                key={subtask.claim_code}
                className={cn(MD_SPAN[cell.md], LG_SPAN[cell.lg], LG_ROWS[cell.lgRows], enters && "motion-safe:animate-human-fade-up")}
                style={enters ? { animationDelay: `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms` } : undefined}
              >
                <OpenSubtaskCard
                  subtask={subtask}
                  featured={cell.featured}
                  left={serverNow === null ? null : msLeft(subtask.deadline_at, serverNow, 0)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmptyList() {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center sm:py-20">
      <span className="grid size-14 place-items-center rounded-full bg-human-accent/10">
        <LiveDot className="size-3" />
      </span>
      <p className="max-w-md text-lg leading-relaxed sm:text-xl">
        No open tasks right now. New ones show up here as soon as someone calls.
      </p>
    </Card>
  );
}

/** "Live" while refreshes work; "Offline" or "Retrying" while they don't. Hidden until the first answer. */
function FreshnessBadge({ state, online }: { state: OpenListState; online: boolean }) {
  if (state.status === "loading") return null;
  if (state.status === "ready" && state.failures === 0) {
    return (
      <Badge size="sm" dot="pulse" className="shrink-0">
        Live
      </Badge>
    );
  }
  return (
    <Badge tone="warning" size="sm" dot className="shrink-0">
      {online ? "Retrying" : "Offline"}
    </Badge>
  );
}

/** Skeletons in the bento's shape: a featured card with two small ones stacked beside it. */
function LoadingGrid() {
  const bar = "rounded-lg bg-human-muted motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading open tasks" role="group" className="flex flex-col gap-5">
      <div aria-hidden="true" className={GRID}>
        <div className="rounded-2xl border border-human-border bg-human-card p-6 shadow-human-md sm:p-8 md:col-span-2 lg:col-span-2 lg:row-span-2 lg:p-12">
          <div className={cn(bar, "size-18 rounded-3xl sm:size-22")} />
          <div className={cn(bar, "mt-10 h-14 w-40 lg:h-18 lg:w-56")} />
          <div className={cn(bar, "mt-4 h-7 w-4/5")} />
          <div className={cn(bar, "mt-3 h-5 w-1/2")} />
          <div className={cn(bar, "mt-12 h-6 w-32")} />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-human-border bg-human-card p-6 shadow-human-md lg:p-8">
            <div className={cn(bar, "size-14 rounded-full")} />
            <div className={cn(bar, "mt-6 h-10 w-28")} />
            <div className={cn(bar, "mt-3 h-5 w-4/5")} />
            <div className={cn(bar, "mt-2 h-4 w-3/5")} />
            <div className={cn(bar, "mt-6 h-5 w-24")} />
          </div>
        ))}
      </div>
      <p className="text-center text-base text-human-muted-fg">Loading open tasks…</p>
    </div>
  );
}

/** Desktop-only decoration by the title: a slow dashed ring and a floating accent shape. */
function TitleDecoration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -top-6 right-4 hidden lg:block">
      <div className="size-36 rounded-full border-2 border-dashed border-human-accent/20 motion-safe:animate-human-spin-slow" />
      <div className="absolute top-6 right-24 size-10 rounded-2xl bg-human-gradient opacity-20 shadow-human-accent motion-safe:animate-human-float" />
    </div>
  );
}
