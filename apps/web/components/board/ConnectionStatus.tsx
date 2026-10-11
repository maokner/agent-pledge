import type { ConnectionStatus as Status } from "@/lib/board/sync";

const LABEL: Record<Status, string> = {
  idle: "Starting",
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  stopped: "Stopped",
};

/** Whether the board's live connection is up, and the last event seq applied. */
export function ConnectionStatus({ status, seq }: { status: Status; seq: number }) {
  const live = status === "open";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" title={`Last event seq ${seq}`}>
      <span className={`size-2.5 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
      {LABEL[status]}
    </span>
  );
}
