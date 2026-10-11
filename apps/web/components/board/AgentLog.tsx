"use client";

import type { AgentLogLevel } from "@agent-pledge/shared";
import { useLayoutEffect, useRef, useState } from "react";
import { countNewerThan, isAtBottom, type AgentLogEntry } from "@/lib/board/agent-log";

const LEVEL_CLASS: Record<AgentLogLevel, string> = {
  info: "text-zinc-600 dark:text-zinc-300 projector:text-zinc-900",
  decision: "font-semibold text-sky-800 dark:text-sky-300 projector:font-bold projector:text-sky-900",
  warning: "text-amber-700 dark:text-amber-300 projector:font-semibold projector:text-amber-800",
  error: "font-semibold text-rose-700 dark:text-rose-300 projector:font-bold projector:text-rose-800",
};

/**
 * The local agent's decision log (PRD 9.1, #37): a scrolling panel, newest
 * line at the bottom, each with its time and the task it belongs to.
 * It follows new lines while scrolled to the bottom. Scrolling up pauses
 * that, and a button jumps back to the latest line.
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
      className="relative flex h-fit flex-col rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 lg:sticky lg:top-6 projector:border-2 projector:border-zinc-400 projector:lg:static projector:lg:h-full projector:lg:min-h-0"
    >
      <h2 id="agent-log-title" className="text-lg font-semibold projector:text-2xl projector:font-bold">
        Agent log
      </h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 projector:text-base projector:text-zinc-700">Decisions the local AI agent makes, as it makes them.</p>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 projector:text-lg projector:text-zinc-700">Nothing yet.</p>
      ) : (
        <ol
          ref={scroller}
          role="log"
          aria-labelledby="agent-log-title"
          onScroll={onScroll}
          className="mt-2 flex max-h-[24rem] flex-col gap-2 overflow-y-auto overscroll-contain pr-1 text-sm lg:max-h-[calc(100vh-10rem)] projector:text-lg projector:leading-snug projector:lg:max-h-none projector:lg:min-h-0 projector:lg:flex-1"
        >
          {entries.map((entry) => (
            <li key={entry.id} className={LEVEL_CLASS[entry.level]}>
              <time className="mr-2 font-mono text-xs text-zinc-500 dark:text-zinc-400 projector:text-base projector:text-zinc-700" dateTime={entry.at}>
                {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </time>
              {entry.task && (
                <span
                  className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 projector:bg-zinc-200 projector:py-0 projector:text-base projector:text-zinc-900"
                  title={entry.task.description ?? undefined}
                >
                  {entry.task.tag}
                </span>
              )}
              {entry.message}
            </li>
          ))}
        </ol>
      )}
      {!following && (
        <button
          type="button"
          onClick={() => setPausedAt(null)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-700 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-sky-800 projector:text-base"
        >
          {unseen > 0 ? `${unseen} new ${unseen === 1 ? "line" : "lines"}, jump to latest` : "Jump to latest"}
        </button>
      )}
    </aside>
  );
}
