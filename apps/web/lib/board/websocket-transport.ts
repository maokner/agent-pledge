/**
 * The real board socket: `GET /ws/board?since=<seq>`. It speaks the server's
 * own shapes, which lib/backend decodes into the board's.
 */
import { BOARD_WS_PATH } from "@/lib/contract";
import { boardMessageFromBackend } from "../backend";
import { wsBaseUrl } from "../config";
import type { BoardTransport } from "./transport";

export function createWebSocketTransport(baseUrl: () => string = wsBaseUrl): BoardTransport {
  return {
    decode: boardMessageFromBackend,
    open(since, handlers) {
      let closedByClient = false;
      const ws = new WebSocket(`${baseUrl()}${BOARD_WS_PATH}?since=${since}`);
      ws.onopen = () => {
        if (!closedByClient) handlers.onOpen();
      };
      ws.onmessage = (event: MessageEvent<string>) => {
        if (closedByClient) return;
        let wire: unknown;
        try {
          wire = JSON.parse(event.data);
        } catch {
          console.warn("Ignoring a board message that is not JSON", event.data);
          return;
        }
        handlers.onMessage(wire);
      };
      // An error is always followed by close, so close is the one place to react.
      ws.onclose = () => {
        if (!closedByClient) handlers.onClose();
      };
      return {
        close() {
          closedByClient = true;
          ws.close();
        },
      };
    },
  };
}
