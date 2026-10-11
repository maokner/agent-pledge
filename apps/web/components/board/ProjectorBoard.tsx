"use client";

import { useState } from "react";
import type { AgentLogEntry } from "@/lib/board/agent-log";
import { taskTag } from "@/lib/board/agent-log";
import { projectorFocus } from "@/lib/board/projector";
import type { TaskView } from "@/lib/board/selectors";
import { cn } from "@/lib/cn";
import { failureText } from "@/lib/labels";
import { AgentLog } from "./AgentLog";
import { BoardHeader } from "./BoardHeader";
import { ProjectorTaskCard } from "./ProjectorTaskCard";
import { HEADER_BUTTON } from "./ProjectorToggle";
import { GLOW, WORK_BORDER } from "./term-style";
import { Countdown, Money, TermButton, Waiting, WorkStatusTag } from "./term";

/** How many other tasks get a small card under the big one. */
const MAX_TILES = 2;

const NO_ARRIVALS: ReadonlySet<string> = new Set();

/**
 * The board in projector mode (#43): one task in a big window, the other
 * tasks as small windows under it, and the agent log on the right, filling
 * the screen with no scrolling. Clicking a small window puts that task in
 * the big one; "Follow newest" goes back to the newest task.
 */
export function ProjectorBoard({
  title = "Agent Pledge",
  command = "./board --projector",
  tasks,
  arrived = NO_ARRIVALS,
  log,
  controls,
}: {
  title?: string;
  command?: string;
  tasks: TaskView[];
  /** Tasks that came in while the board was open: their title bars flash once. */
  arrived?: ReadonlySet<string>;
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
    <>
      <BoardHeader
        title={title}
        command={command}
        controls={
          <>
            {pinned && (
              <TermButton onClick={() => setPinnedId(null)} className={HEADER_BUTTON}>
                FOLLOW NEWEST
              </TermButton>
            )}
            {controls}
          </>
        }
      />

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex flex-col gap-4 lg:min-h-0">
          {focus ? (
            <ProjectorTaskCard key={focus.task.id} view={focus} arrived={arrived.has(focus.task.id)} />
          ) : (
            <Waiting className="flex-1 text-4xl font-bold">No tasks yet. Call the Agent Pledge number to make one</Waiting>
          )}
          {tiles.length > 0 && (
            <section aria-label="Other tasks" className="flex shrink-0 gap-4">
              {tiles.map((view) => (
                <TaskTile
                  key={view.task.id}
                  view={view}
                  arrived={arrived.has(view.task.id)}
                  onSelect={() => setPinnedId(view.task.id)}
                />
              ))}
              {hidden > 0 && (
                <p className="flex shrink-0 items-center border border-dashed border-term-line px-4 text-lg font-bold text-term-fg-dim">
                  +{hidden} more
                </p>
              )}
            </section>
          )}
        </main>
        <AgentLog entries={log} />
      </div>
    </>
  );
}

/** A small window for a task that is not in the big one: status, amount, time left or result, in two rows. */
function TaskTile({ view, arrived, onSelect }: { view: TaskView; arrived: boolean; onSelect: () => void }) {
  const { task } = view;
  const subtask = view.subtasks.at(-1);
  const active = task.status === "open" || task.status === "claimed";
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Show this task in the big window${failureText(task) ? `. Failed: ${failureText(task)}` : ""}`}
      className={cn(
        "group flex min-w-0 flex-1 basis-0 flex-col border text-left outline-none hover:border-term-fg focus-visible:border-term-fg",
        WORK_BORDER[task.status],
      )}
    >
      <span
        className={cn(
          "flex w-full items-baseline gap-2 border-b border-term-line px-2 text-base font-bold uppercase group-focus-visible:bg-term-fg group-focus-visible:text-term-bg",
          arrived && "motion-safe:animate-term-arrive",
        )}
      >
        <span aria-hidden className="text-term-fg-dim group-focus-visible:text-term-bg">
          +---
        </span>
        Task {taskTag(task.id)}
        <span aria-hidden className="ml-auto text-term-fg-dim group-focus-visible:text-term-bg">
          [ SHOW ]
        </span>
      </span>
      <span className="flex w-full flex-col gap-1 p-2">
        <span className="flex w-full items-baseline gap-x-4">
          <WorkStatusTag status={task.status} size="xl" />
          <Money amount={task.price} className={cn("text-2xl font-bold", GLOW)} />
          <span className="ml-auto truncate text-lg font-bold">
            {active ? (
              <Countdown deadline={task.deadline_at} className={cn("text-2xl", GLOW)} />
            ) : task.status === "failed" ? (
              <span className="text-term-status-refund">[RFND] ↩ Refunded</span>
            ) : (
              <span className="text-term-status-validated">[OK] Requester has a seat</span>
            )}
          </span>
        </span>
        <span className="flex w-full items-baseline gap-x-4 text-lg">
          <span className="min-w-0 flex-1 truncate">{task.description}</span>
          {subtask?.status === "claimed" && (
            <span className="shrink-0 text-term-fg-dim">
              PIN tries left{" "}
              <span className={cn("text-2xl font-bold", subtask.pin_locked ? "text-term-red" : "text-term-fg")}>
                {subtask.pin_locked ? "[ERR] LOCKED" : subtask.pin_attempts_left}
              </span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
