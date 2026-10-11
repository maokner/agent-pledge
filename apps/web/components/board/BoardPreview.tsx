"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { selectAgentLog } from "@/lib/board/agent-log";
import { selectTaskViews } from "@/lib/board/selectors";
import { useProjectorMode } from "@/lib/board/use-projector-mode";
import { cn } from "@/lib/cn";
import { buildPreviewState, PREVIEW_LAYOUTS, type PreviewLayout } from "@/lib/fixtures/preview";
import { AgentLog } from "./AgentLog";
import { BoardHeader } from "./BoardHeader";
import { BoardShell } from "./BoardShell";
import { ProjectorBoard } from "./ProjectorBoard";
import { ProjectorToggle } from "./ProjectorToggle";
import { TaskCard } from "./TaskCard";
import { Bracket, Pane, termButton } from "./term";

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
  const link = (current: boolean) =>
    cn(
      termButton({ variant: "bracket" }),
      "projector:text-base",
      current && "bg-term-fg text-term-bg text-shadow-none",
    );
  const nav = (
    <nav aria-label="Preview layouts" className="flex flex-wrap gap-x-2">
      {(Object.keys(PREVIEW_LAYOUTS) as PreviewLayout[]).map((key) => (
        <Link
          key={key}
          href={`/preview?layout=${key}`}
          aria-current={key === layout ? "page" : undefined}
          className={link(key === layout)}
        >
          <Bracket>{PREVIEW_LAYOUTS[key]}</Bracket>
        </Link>
      ))}
      <Link href="/board" className={link(false)}>
        <Bracket>LIVE BOARD</Bracket>
      </Link>
    </nav>
  );
  const command = `./board --preview=${layout}`;

  if (projector) {
    return (
      <BoardShell projector>
        <ProjectorBoard
          title="Board preview"
          command={command}
          tasks={tasks}
          log={log}
          controls={
            <>
              {nav}
              <ProjectorToggle on onChange={setProjector} />
            </>
          }
        />
      </BoardShell>
    );
  }

  return (
    <BoardShell>
      <BoardHeader
        title="Board preview"
        command={command}
        controls={
          <>
            {nav}
            <ProjectorToggle on={false} onChange={setProjector} />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Pane title="Incoming tasks" inverted aria-label="Tasks" bodyClassName="gap-4 p-2 sm:p-3">
          {tasks.map((view) => (
            <TaskCard key={view.task.id} view={view} />
          ))}
        </Pane>
        <AgentLog entries={log} />
      </div>
    </BoardShell>
  );
}
