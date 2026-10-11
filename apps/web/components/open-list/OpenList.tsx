"use client";

import type { OpenSubtaskSummary } from "@agent-pledge/shared";
import { CloudOff, RotateCw } from "lucide-react";
import { Badge } from "@/components/human/Badge";
import { Button } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { HumanHeader } from "@/components/human/HumanHeader";
import { LiveDot } from "@/components/human/LiveDot";
import { Notice } from "@/components/human/Notice";
import { openSubtasksToShow } from "@/lib/api";
import { msLeft } from "@/lib/claim/clock";
import type { OpenListState } from "@/lib/open-list/feed";
import { useOpenList } from "@/lib/open-list/use-open-list";
import { useNow } from "@/lib/use-now";
import { OpenSubtaskCard } from "./OpenSubtaskCard";

/** The first list fades up one card at a time, this far apart. */
const STAGGER_MS = 100;
/** Cards further down start with the last one that staggers. */
const MAX_STAGGERED = 6;

/**
 * /human: the open sub-tasks a Helper can claim, soonest deadline first. Each
 * card opens its claim page. The list refreshes itself (useOpenList) and drops
 * a sub-task the second its time runs out, on the server's clock.
 */
export function OpenList() {
  const { state, online, retry } = useOpenList();
  const now = useNow(1000);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-2 pb-12 sm:px-5">
      <HumanHeader />

      <section aria-labelledby="open-list-title" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h1 id="open-list-title" className="font-display text-4xl leading-[1.1] tracking-[-0.02em]">
            Open <span className="text-human-gradient">tasks</span>
          </h1>
          <FreshnessBadge state={state} online={online} />
        </div>
        <p className="text-lg leading-relaxed text-human-muted-fg">Do a quick task nearby and get paid when it’s done.</p>
      </section>

      {/* Says when new sub-tasks arrive; never the countdown ticks. Always in the page, so it is heard. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {state.status === "ready" ? state.announcement : null}
      </p>

      {state.status === "loading" && <LoadingList />}
      {state.status === "error" && (
        <Notice
          tone="danger"
          title="Open tasks did not load"
          action={
            <Button variant="secondary" onClick={retry} icon={<RotateCw aria-hidden="true" className="size-5" />}>
              Try again
            </Button>
          }
        >
          {online ? "Check your signal. We keep trying in the background." : "You’re offline. We’ll try again when you’re back."}
        </Notice>
      )}
      {state.status === "ready" && <ReadyList state={state} now={now} online={online} />}
    </main>
  );
}

function ReadyList({
  state,
  now,
  online,
}: {
  state: Extract<OpenListState, { status: "ready" }>;
  now: number | null;
  online: boolean;
}) {
  // Before the clock's first tick, show the list as loaded; after, drop what has run out.
  const serverNow = now === null ? null : now + state.offsetMs;
  const shown: readonly OpenSubtaskSummary[] = serverNow === null ? state.subtasks : openSubtasksToShow(state.subtasks, serverNow);
  const entering = new Set(state.entering);

  return (
    <div className="flex flex-col gap-4">
      {state.failures > 0 && (
        <p className="flex items-start gap-2 text-base text-human-muted-fg">
          <CloudOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {online ? "Can’t refresh right now. Showing the last list while we try again." : "You’re offline. Showing the last list."}
        </p>
      )}
      {shown.length === 0 ? (
        <EmptyList />
      ) : (
        <ul aria-labelledby="open-list-title" className="flex flex-col gap-4">
          {shown.map((subtask, index) => {
            const enters = entering.has(subtask.claim_code);
            return (
              <li
                key={subtask.claim_code}
                className={enters ? "motion-safe:animate-human-fade-up" : undefined}
                style={enters ? { animationDelay: `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms` } : undefined}
              >
                <OpenSubtaskCard
                  subtask={subtask}
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
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <LiveDot className="size-3" />
      <p className="max-w-xs text-lg leading-relaxed">
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

function LoadingList() {
  return (
    <section aria-busy="true" aria-label="Loading open tasks" className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="rounded-2xl border border-human-border bg-human-card p-5 shadow-human-md">
          <div className="h-12 w-28 rounded-lg bg-human-muted motion-safe:animate-pulse" />
          <div className="mt-3 h-5 w-4/5 rounded bg-human-muted motion-safe:animate-pulse" />
          <div className="mt-2 h-4 w-3/5 rounded bg-human-muted motion-safe:animate-pulse" />
          <div className="mt-5 h-5 w-24 rounded bg-human-muted motion-safe:animate-pulse" />
        </div>
      ))}
      <p className="text-center text-base text-human-muted-fg">Loading open tasks…</p>
    </section>
  );
}
