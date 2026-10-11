/** The real board socket from the contract: `GET /ws/board?since=<seq>`. */
import { BOARD_WS_PATH, type BoardServerMessage } from "@agent-pledge/shared";
import { wsBaseUrl } from "../config";
import type { BoardTransport } from "./transport";

export function createWebSocketTransport(baseUrl: () => string = wsBaseUrl): BoardTransport {
  return {
    open(since, handlers) {
      let closedByClient = false;
      const ws = new WebSocket(`${baseUrl()}${BOARD_WS_PATH}?since=${since}`);
      ws.onopen = () => {
        if (!closedByClient) handlers.onOpen();
      };
      ws.onmessage = (event: MessageEvent<string>) => {
        if (closedByClient) return;
        let message: BoardServerMessage;
        try {
          message = JSON.parse(event.data) as BoardServerMessage;
        } catch {
          console.warn("Ignoring a board message that is not JSON", event.data);
          return;
        }
        handlers.onMessage(message);
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
