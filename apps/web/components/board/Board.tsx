"use client";

import { selectAgentLog } from "@/lib/board/agent-log";
import { selectTaskViews } from "@/lib/board/selectors";
import { useBoard } from "@/lib/board/use-board";
import { FIXTURE_MODE } from "@/lib/config";
import { FixtureBadge } from "@/components/ui/FixtureBadge";
import { AgentLog } from "./AgentLog";
import { ConnectionStatus } from "./ConnectionStatus";
import { FixtureControls } from "./FixtureControls";
import { LatencyMeter } from "./LatencyMeter";
import { TaskCard } from "./TaskCard";

/** The public board (PRD 9.1): every task with its sub-tasks and transactions, plus the agent log. */
export function Board() {
  const { state, status, latency } = useBoard();
  const tasks = selectTaskViews(state);

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
    </div>
  );
}
