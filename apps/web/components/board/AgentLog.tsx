"use client";

import type { AgentLogLevel } from "@agent-pledge/shared";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { countNewerThan, isAtBottom, type AgentLogEntry } from "@/lib/board/agent-log";
import { GLOW } from "./term-style";
import { Cursor, TermButton } from "./term";

/** Each level is a text tag too, so it never relies on color alone. */
const LEVEL: Record<AgentLogLevel, { tag: string; className: string }> = {
  info: { tag: "[INF]", className: "text-term-fg-dim" },
  decision: { tag: "[DEC]", className: cn("font-bold text-term-fg", GLOW) },
  warning: { tag: "[WRN]", className: "text-term-amber" },
  error: { tag: "[ERR]", className: "font-bold text-term-red" },
};

/**
 * The local agent's decision log (PRD 9.1, #37): a scrolling terminal pane,
 * newest line at the bottom, each with its time, level and the task it
 * belongs to. It follows new lines while scrolled to the bottom. Scrolling
 * up pauses that, and a button jumps back to the latest line.
 */
export function AgentLog({ entries }: { entries: AgentLogEntry[] }) {
  const scroller = useRef<HTMLOListElement>(null);
  // The last line the reader saw when they scrolled up; null while following.
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const following = pausedAt === null;
  const lastId = entries.at(-1)?.id ?? null;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [following, lastId]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    if (isAtBottom(el)) setPausedAt(null);
    else if (following) setPausedAt(lastId ?? "");
  }

  const unseen = countNewerThan(entries, pausedAt);

  return (
    <aside
      aria-labelledby="agent-log-title"
      className="relative flex h-fit min-w-0 flex-col border border-term-line bg-term-bg lg:sticky lg:top-6 projector:lg:static projector:lg:h-full projector:lg:min-h-0"
    >
      <div className="flex items-baseline justify-between gap-2 bg-term-fg px-2 py-1 text-term-bg">
        <h2 id="agent-log-title" className="font-bold tracking-wide uppercase projector:text-lg">
          Agent log
        </h2>
        <span className="text-sm projector:text-base">{following ? "[FOLLOW]" : "[PAUSED]"}</span>
      </div>
      <p className="border-b border-term-line px-3 py-1 text-sm text-term-fg-dim projector:text-base">
        <span aria-hidden>$ tail -f agent.log </span>
        <span className="sr-only">Decisions the local AI agent makes, as it makes them.</span>
        <span aria-hidden className="block">
          # decisions the local AI agent makes, as it makes them
        </span>
      </p>
      {entries.length === 0 ? (
        <p className="px-3 py-2 text-sm text-term-fg-dim projector:text-lg">
          <span aria-hidden>&gt; </span>Nothing yet. <Cursor />
        </p>
      ) : (
        <ol
          ref={scroller}
          role="log"
          aria-labelledby="agent-log-title"
          onScroll={onScroll}
          className="flex max-h-[24rem] flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-2 text-sm wrap-anywhere lg:max-h-[calc(100vh-12rem)] projector:text-lg projector:leading-snug projector:lg:max-h-none projector:lg:min-h-0 projector:lg:flex-1"
        >
          {entries.map((entry) => {
            const level = LEVEL[entry.level];
            return (
              <li key={entry.id} className={level.className}>
                <time className="mr-2 text-term-fg-dim tabular-nums" dateTime={entry.at}>
                  {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <span className="mr-2">{level.tag}</span>
                {entry.task && (
                  <span className="mr-2 text-term-amber" title={entry.task.description ?? undefined}>
                    {entry.task.tag}
                  </span>
                )}
                {entry.message}
              </li>
            );
          })}
          <li aria-hidden className="text-term-fg">
            &gt; <Cursor />
          </li>
        </ol>
      )}
      {!following && (
        <TermButton
          variant="solid"
          onClick={() => setPausedAt(null)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 text-sm projector:text-base"
        >
          {unseen > 0 ? `[ ${unseen} NEW ${unseen === 1 ? "LINE" : "LINES"}, JUMP TO LATEST ]` : "[ JUMP TO LATEST ]"}
        </TermButton>
      )}
    </aside>
  );
}
