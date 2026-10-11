/**
 * A transport opens one board connection at a time. Two implementations:
 * the real WebSocket (websocket-transport.ts) and the simulated fixture
 * stream (fixture-transport.ts). Reconnects and resyncs live in sync.ts.
 */
import type { BoardServerMessage } from "@/lib/contract";
import type { BoardState } from "./state";

export interface BoardConnectionHandlers {
  onOpen(): void;
  /** One message as it came off the wire. The sync layer decodes it with the transport's `decode`. */
  onMessage(wire: unknown): void;
  /** The connection ended without the client asking. Not called after close(). */
  onClose(): void;
}

export interface BoardConnection {
  close(): void;
}

export interface BoardTransport {
  /**
   * Opens a connection that first delivers what the client missed after
   * `since` (a replay of events, or a board.snapshot), then live events.
   */
  open(since: number, handlers: BoardConnectionHandlers): BoardConnection;
  /**
   * Turns one wire message into the board's own message, given the state it
   * will apply to. The real server sends patches, so its decoder
   * (lib/backend) fills them in from that state. Returns null to drop a
   * message. Omitted when the wire already carries the board's own messages
   * (the fixture stream).
   */
  decode?(wire: unknown, state: BoardState): BoardServerMessage | null;
}
