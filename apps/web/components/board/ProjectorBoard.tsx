"use client";

import { useState } from "react";
import type { AgentLogEntry } from "@/lib/board/agent-log";
import { projectorFocus } from "@/lib/board/projector";
import type { TaskView } from "@/lib/board/selectors";
import { Countdown } from "@/components/ui/Countdown";
import { FixtureBadge } from "@/components/ui/FixtureBadge";
import { Money } from "@/components/ui/Money";
import { FAILURE_REASON_LABEL } from "@/lib/labels";
import { AgentLog } from "./AgentLog";
import { LiveStatusBadge } from "./LiveStatus";
import { ProjectorTaskCard } from "./ProjectorTaskCard";
import { HEADER_BUTTON } from "./ProjectorToggle";
import { WORK_STATUS_STYLE } from "./status-style";

/** How many other tasks get a small card under the big one. */
const MAX_TILES = 2;

/**
 * The board in projector mode (#43): one task in a big card, the other tasks
 * as small cards under it, and the agent log on the right, filling the screen
 * with no scrolling. Clicking a small card puts that task in the big card;
 * "Follow newest" goes back to the newest task.
 */
export function ProjectorBoard({
  title = "Agent Pledge",
  tasks,
  log,
  controls,
}: {
  title?: string;
  tasks: TaskView[];
  log: AgentLogEntry[];
  /** The right side of the header: connection, toggle, operator links. */
  controls: React.ReactNode;
}) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const { focus, others } = projectorFocus(tasks, pinnedId);
  const pinned = focus !== null && focus.task.id === pinnedId;
  const tiles = others.slice(0, MAX_TILES);
  const hidden = others.length - tiles.length;

  return (
    <div className="flex flex-col gap-4 p-4 lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
          <FixtureBadge />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {pinned && (
            <button type="button" onClick={() => setPinnedId(null)} className={HEADER_BUTTON}>
              Follow newest
            </button>
          )}
          {controls}
        </div>
      </header>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex flex-col gap-4 lg:min-h-0">
          {focus ? (
            <ProjectorTaskCard key={focus.task.id} view={focus} />
          ) : (
            <p className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-zinc-500 p-8 text-center text-4xl font-bold text-zinc-700">
              No tasks yet. Call the Agent Pledge number to make one.
            </p>
          )}
          {tiles.length > 0 && (
            <section aria-label="Other tasks" className="flex shrink-0 gap-4">
              {tiles.map((view) => (
                <TaskTile key={view.task.id} view={view} onSelect={() => setPinnedId(view.task.id)} />
              ))}
              {hidden > 0 && (
                <p className="flex shrink-0 items-center rounded-xl border-2 border-dashed border-zinc-500 px-4 text-xl font-bold text-zinc-800">
                  +{hidden} more
                </p>
              )}
            </section>
          )}
        </main>
        <AgentLog entries={log} />
      </div>
    </div>
  );
}

/** A small card for a task that is not in the big card: status, amount, time left or result, in two rows. */
function TaskTile({ view, onSelect }: { view: TaskView; onSelect: () => void }) {
  const { task } = view;
  const subtask = view.subtasks.at(-1);
  const active = task.status === "open" || task.status === "claimed";
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Show this task in the big card${task.failure_reason ? `. Failed: ${FAILURE_REASON_LABEL[task.failure_reason]}` : ""}`}
      className={`flex min-w-0 flex-1 basis-0 flex-col gap-1 rounded-xl border-2 border-l-[0.75rem] border-zinc-400 p-3 text-left hover:border-zinc-700 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${WORK_STATUS_STYLE[task.status].card}`}
    >
      <span className="flex w-full items-center gap-x-4">
        <LiveStatusBadge status={task.status} size="xl" />
        <Money amount={task.price} className="text-3xl font-extrabold" />
        <span className="ml-auto truncate text-xl font-semibold">
          {active ? (
            <Countdown deadline={task.deadline_at} className="text-3xl font-extrabold" />
          ) : task.status === "failed" ? (
            <span className="text-rose-800">Refunded</span>
          ) : (
            <span className="text-emerald-800">Requester has a seat</span>
          )}
        </span>
      </span>
      <span className="flex w-full items-baseline gap-x-4 text-xl">
        <span className="min-w-0 flex-1 truncate font-semibold">{task.description}</span>
        {subtask?.status === "claimed" && (
          <span className="shrink-0 font-semibold">
            PIN tries left <span className="text-2xl font-extrabold">{subtask.pin_locked ? "Locked" : subtask.pin_attempts_left}</span>
          </span>
        )}
      </span>
    </button>
  );
}
