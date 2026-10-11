import type { ConnectionStatus as Status } from "@/lib/board/sync";

const LABEL: Record<Status, string> = {
  idle: "Starting",
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Offline, reconnecting",
  stopped: "Offline",
};

const DOT: Record<Status, string> = {
  idle: "bg-amber-500 animate-pulse",
  connecting: "bg-amber-500 animate-pulse",
  open: "bg-emerald-500",
  reconnecting: "bg-rose-600 animate-pulse",
  stopped: "bg-rose-600",
};

/**
 * Whether the board's live connection is up, and the last event seq applied.
 * Red when the socket is down, so we notice during the demo (#35).
 */
export function ConnectionStatus({ status, seq }: { status: Status; seq: number }) {
  const down = status === "reconnecting" || status === "stopped";
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 text-sm projector:text-xl projector:font-semibold ${down ? "font-semibold text-rose-700 dark:text-rose-300" : "text-zinc-600 dark:text-zinc-300 projector:text-zinc-900"}`}
      title={`Last event seq ${seq}`}
      data-status={status}
    >
      <span aria-hidden className={`size-2.5 rounded-full projector:size-4 ${DOT[status]}`} />
      {LABEL[status]}
    </span>
  );
}
