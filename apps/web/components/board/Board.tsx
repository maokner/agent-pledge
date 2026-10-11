"use client";

import { selectAgentLog } from "@/lib/board/agent-log";
import { selectTaskViews } from "@/lib/board/selectors";
import { useBoard } from "@/lib/board/use-board";
import { useProjectorMode } from "@/lib/board/use-projector-mode";
import { FIXTURE_MODE } from "@/lib/config";
import { FixtureBadge } from "@/components/ui/FixtureBadge";
import { AgentLog } from "./AgentLog";
import { BackupTaskForm } from "./BackupTaskForm";
import { ConnectionStatus } from "./ConnectionStatus";
import { FixtureControls } from "./FixtureControls";
import { LatencyMeter } from "./LatencyMeter";
import { ProjectorBoard } from "./ProjectorBoard";
import { ProjectorToggle } from "./ProjectorToggle";
import { TaskCard } from "./TaskCard";

/**
 * The public board (PRD 9.1): every task with its sub-tasks and transactions,
 * plus the agent log. Projector mode (#43) lays the same data out for a
 * projector; see README.md, "Projector mode".
 */
export function Board() {
  const { state, status, latency } = useBoard();
  const [projector, setProjector] = useProjectorMode();
  const tasks = selectTaskViews(state);
  const isOnBoard = (taskId: string) => taskId in state.tasks;

  if (projector) {
    return (
      <ProjectorBoard
        tasks={tasks}
        log={selectAgentLog(state)}
        controls={
          <>
            <ConnectionStatus status={status} seq={state.seq} />
            <LatencyMeter latency={latency} seq={state.seq} />
            {FIXTURE_MODE && <FixtureControls />}
            <BackupTaskForm isOnBoard={isOnBoard} />
            <ProjectorToggle on onChange={setProjector} />
          </>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Agent Pledge</h1>
          <FixtureBadge />
        </div>
        <div className="flex items-center gap-3">
          {FIXTURE_MODE && <FixtureControls />}
          <ConnectionStatus status={status} seq={state.seq} />
          <LatencyMeter latency={latency} seq={state.seq} />
          <ProjectorToggle on={false} onChange={setProjector} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Tasks" className="flex flex-col gap-6">
          {tasks.length === 0 ? (
            <p className="text-lg text-zinc-500">No tasks yet. Call the Agent Pledge number to make one.</p>
          ) : (
            tasks.map((view) => <TaskCard key={view.task.id} view={view} />)
          )}
        </section>
        <AgentLog entries={selectAgentLog(state)} />
      </div>

      <footer className="flex justify-end">
        <BackupTaskForm isOnBoard={isOnBoard} />
      </footer>
    </div>
  );
}
