/**
 * The adapter between the real server (`origin/backend-all`, docs/api.md) and
 * the web app's own types (the DRAFT `@agent-pledge/shared`). Everything that
 * knows the server's shapes lives in this folder:
 *
 * - types.ts: the server's wire types, mirrored as plain TypeScript
 * - board.ts: GET /board/state and the board socket's snapshot and patch events
 * - claim.ts: the claim view, its wrapped responses, and the helper token
 * - errors.ts: the server's error codes as the web app's
 * - open-subtasks.ts: the /human list, derived from GET /board/state
 *
 * lib/api/http-client.ts and lib/board/websocket-transport.ts use it.
 * Fixture mode never does: the fixture client already speaks the web app's types.
 */
export { boardMessageFromBackend, boardSnapshotFromBackend } from "./board";
