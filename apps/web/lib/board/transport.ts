/**
 * A transport opens one board connection at a time. Two implementations:
 * the real WebSocket (websocket-transport.ts) and the simulated fixture
 * stream (fixture-transport.ts). Reconnects and resyncs live in sync.ts.
 */
import type { BoardServerMessage } from "@agent-pledge/shared";

export interface BoardConnectionHandlers {
  onOpen(): void;
  onMessage(message: BoardServerMessage): void;
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
}
