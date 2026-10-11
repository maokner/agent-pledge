/**
 * The adapter between the real server (`origin/backend-all`, docs/api.md) and
 * the web app's own types (the DRAFT contract in lib/contract). Everything that
 * knows the server's shapes lives in this folder:
 *
 * - types.ts: the server's wire types, re-exported from @agent-pledge/shared
 * - board.ts: GET /board/state and the board socket's snapshot and patch events
 * - claim.ts: the claim view's state, and where the helper token is kept
 * - errors.ts: the server's error bodies and codes as ApiError
 * - open-subtasks.ts: the /human list, derived from GET /board/state
 * - tasks.ts: create_task's response and GET /tasks/:id.json
 *
 * lib/api/http-client.ts and lib/board/websocket-transport.ts use it.
 * Fixture mode never does: the fixture client already speaks the web app's types.
 */
export { boardMessageFromBackend, boardSnapshotFromBackend, subtasksOf } from "./board";
export { claimStateOf, claimViewFromBackend, createHelperTokenStore, type HelperTokenStore } from "./claim";
export { apiErrorFromBackend, attemptsLeftFrom, type ErrorContext } from "./errors";
export { openSubtasksFromBackend } from "./open-subtasks";
export { createTaskResponseFromBackend, taskNftDataFromBackend } from "./tasks";
