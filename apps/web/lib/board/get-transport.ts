import type { BoardSnapshot } from "@agent-pledge/shared";
import { getApiClient } from "../api";
import { FIXTURE_MODE } from "../config";
import { createFixtureTransport, type FixtureTransport } from "./fixture-transport";
import type { BoardTransport } from "./transport";
import { createWebSocketTransport } from "./websocket-transport";

let fixture: FixtureTransport | null = null;

/** The fixture transport when NEXT_PUBLIC_FIXTURES=1, else the real WebSocket. Browser only. */
export function getBoardTransport(): BoardTransport {
  return getFixtureTransport() ?? createWebSocketTransport();
}

/**
 * `GET /board/state`: from the fixture transport in fixture mode (so the
 * snapshot matches its event stream), else from the server. Browser only.
 */
export function loadBoardSnapshot(): Promise<BoardSnapshot> {
  return getFixtureTransport()?.loadSnapshot() ?? getApiClient().getBoardState();
}

/** The shared fixture transport (one simulated server per tab), or null outside fixture mode. */
export function getFixtureTransport(): FixtureTransport | null {
  if (!FIXTURE_MODE) return null;
  fixture ??= createFixtureTransport();
  return fixture;
}
