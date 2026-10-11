"use client";

import { selectAgentLog } from "@/lib/board/agent-log";
import { selectTaskViews } from "@/lib/board/selectors";
import { useArrivals } from "@/lib/board/use-arrivals";
import { useBoard } from "@/lib/board/use-board";
import { useProjectorMode } from "@/lib/board/use-projector-mode";
import { FIXTURE_MODE } from "@/lib/config";
import { AgentLog } from "./AgentLog";
import { BackupTaskForm } from "./BackupTaskForm";
import { BoardHeader } from "./BoardHeader";
import { BoardShell } from "./BoardShell";
import { ConnectionStatus } from "./ConnectionStatus";
import { FixtureControls } from "./FixtureControls";
import { LatencyMeter } from "./LatencyMeter";
import { ProjectorBoard } from "./ProjectorBoard";
import { ProjectorToggle } from "./ProjectorToggle";
import { TaskCard } from "./TaskCard";
import { Pane, Waiting } from "./term";

/**
 * The public board (PRD 9.1): every task with its sub-tasks and transactions,
 * plus the agent log, as a terminal. Projector mode (#43) lays the same data
 * out for a projector; see README.md, "Projector mode". Tasks that come in
 * while the board is open flash once as they arrive.
 */
export function Board() {
  const { state, status, latency } = useBoard();
  const [projector, setProjector] = useProjectorMode();
  const tasks = selectTaskViews(state);
  const arrived = useArrivals(
    tasks.map((view) => view.task.id),
    state.seq > 0 || status === "open",
  );
  const isOnBoard = (taskId: string) => taskId in state.tasks;

  if (projector) {
    return (
      <BoardShell projector>
        <ProjectorBoard
          tasks={tasks}
          arrived={arrived}
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
      </BoardShell>
    );
  }

  return (
    <BoardShell>
      <BoardHeader
        command="./board --live"
        controls={
          <>
            {FIXTURE_MODE && <FixtureControls />}
            <ConnectionStatus status={status} seq={state.seq} />
            <LatencyMeter latency={latency} seq={state.seq} />
            <ProjectorToggle on={false} onChange={setProjector} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Pane title="Incoming tasks" inverted aria-label="Tasks" bodyClassName="gap-4 p-2 sm:p-3">
          {tasks.length === 0 ? (
            <Waiting className="text-lg">No tasks yet. Call the Agent Pledge number to make one</Waiting>
          ) : (
            tasks.map((view) => <TaskCard key={view.task.id} view={view} arrived={arrived.has(view.task.id)} />)
          )}
        </Pane>
        <AgentLog entries={selectAgentLog(state)} />
      </div>

      <footer className="flex justify-end">
        <BackupTaskForm isOnBoard={isOnBoard} />
      </footer>
    </BoardShell>
  );
}
