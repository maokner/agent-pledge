"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { selectAgentLog } from "@/lib/board/agent-log";
import { selectTaskViews } from "@/lib/board/selectors";
import { useProjectorMode } from "@/lib/board/use-projector-mode";
import { buildPreviewState, PREVIEW_LAYOUTS, type PreviewLayout } from "@/lib/fixtures/preview";
import { FixtureBadge } from "@/components/ui/FixtureBadge";
import { AgentLog } from "./AgentLog";
import { ProjectorBoard } from "./ProjectorBoard";
import { ProjectorToggle } from "./ProjectorToggle";
import { TaskCard } from "./TaskCard";

/**
 * Fixture-only layout check for the board cards (#32): static board states
 * in the same column widths as the live board, or in projector mode (#43)
 * with `&projector=1`. Not linked from the board.
 */
export function BoardPreview({ layout }: { layout: PreviewLayout }) {
  // The fixture clock starts when the page mounts in the browser, never during prerender.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);
  const [projector, setProjector] = useProjectorMode();
  const state = now === null ? null : buildPreviewState(layout, now);
  const tasks = state ? selectTaskViews(state) : [];
  const log = state ? selectAgentLog(state) : [];
  const nav = (
    <nav aria-label="Preview layouts" className="flex flex-wrap gap-2 text-sm projector:text-base">
      {(Object.keys(PREVIEW_LAYOUTS) as PreviewLayout[]).map((key) => (
        <Link
          key={key}
          href={`/preview?layout=${key}`}
          aria-current={key === layout ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded border px-2 ${key === layout ? "border-zinc-900 font-semibold dark:border-zinc-100" : "border-zinc-300 dark:border-zinc-600"}`}
        >
          {PREVIEW_LAYOUTS[key]}
        </Link>
      ))}
      <Link href="/" className="inline-flex min-h-9 items-center rounded border border-zinc-300 px-2 dark:border-zinc-600">
        Live board
      </Link>
    </nav>
  );

  if (projector) {
    return (
      <ProjectorBoard
        title="Board preview"
        tasks={tasks}
        log={log}
        controls={
          <>
            {nav}
            <ProjectorToggle on onChange={setProjector} />
          </>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Board preview</h1>
        <FixtureBadge />
        {nav}
        <ProjectorToggle on={false} onChange={setProjector} />
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Tasks" className="flex flex-col gap-6">
          {tasks.map((view) => (
            <TaskCard key={view.task.id} view={view} />
          ))}
        </section>
        <AgentLog entries={log} />
      </div>
    </div>
  );
}
