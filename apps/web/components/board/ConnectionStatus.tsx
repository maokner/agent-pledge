import type { ConnectionStatus as Status } from "@/lib/board/sync";
import type { TermTag } from "@/lib/board/terminal";
import { Cursor, StatusTag } from "./term";

const TAG: Record<Status, TermTag> = {
  idle: { tag: "[..]", word: "STARTING", tone: "pending" },
  connecting: { tag: "[..]", word: "CONNECTING", tone: "pending" },
  open: { tag: "[OK]", word: "LIVE", tone: "validated" },
  reconnecting: { tag: "[ERR]", word: "OFFLINE, RECONNECTING", tone: "failed" },
  stopped: { tag: "[ERR]", word: "OFFLINE", tone: "failed" },
};

/**
 * Whether the board's live connection is up, and the last event seq applied.
 * Red [ERR] when the socket is down, so we notice during the demo (#35).
 */
export function ConnectionStatus({ status, seq }: { status: Status; seq: number }) {
  const waiting = status === "idle" || status === "connecting" || status === "reconnecting";
  return (
    <span
      role="status"
      title={`Last event seq ${seq}`}
      data-status={status}
      className="inline-flex items-baseline"
    >
      <StatusTag tag={TAG[status]} size="sm" className="projector:text-lg">
        {waiting && <Cursor />}
      </StatusTag>
    </span>
  );
}
