/**
 * Local mock of the server's voice-agent tool endpoints.
 * Usage: pnpm mock-server [--port 8787] [--fail none|create_task|task_status|all]
 */
import { parseArgs } from "node:util";
import {
  FAIL_MODES,
  createMockContext,
  createMockHttpServer,
  type FailMode,
} from "../src/mock-server.js";
import { loadDotEnv } from "../src/paths.js";

loadDotEnv();

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    fail: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log("Usage: pnpm mock-server [--port 8787] [--fail none|create_task|task_status|all]");
  console.log("Env: VOICE_TOOL_SECRET, MOCK_PORT, MOCK_BOARD_URL, MOCK_FAIL");
  process.exit(0);
}

const port = Number(values.port ?? process.env.MOCK_PORT ?? 8787);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  console.error(`Invalid port: ${values.port ?? process.env.MOCK_PORT}`);
  process.exit(1);
}

const failMode = (values.fail ?? process.env.MOCK_FAIL ?? "none") as FailMode;
if (!FAIL_MODES.includes(failMode)) {
  console.error(`Invalid fail mode "${failMode}". Use one of: ${FAIL_MODES.join(", ")}.`);
  process.exit(1);
}

let secret = process.env.VOICE_TOOL_SECRET ?? "";
if (!secret) {
  secret = "dev-voice-secret";
  console.warn(`VOICE_TOOL_SECRET is not set. Using "${secret}" for local testing only.`);
}

const ctx = createMockContext({
  secret,
  boardUrl: process.env.MOCK_BOARD_URL ?? `http://localhost:${port}/board`,
  failMode,
});

const server = createMockHttpServer(ctx, (entry) => {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${time} ${entry.method} ${entry.url} -> ${entry.status}`);
  if (entry.requestBody) console.log(`  request:  ${entry.requestBody}`);
  console.log(`  response: ${JSON.stringify(entry.responseBody)}`);
});

server.listen(port, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`Mock tool server on http://localhost:${actualPort} (fail mode: ${failMode})`);
  console.log("  POST /tools/create_task");
  console.log("  GET  /tools/task_status/:task_id");
  console.log("  GET  /mock/tasks             list tasks (mock only)");
  console.log("  POST /mock/tasks/:task_id    set {status, helper_note} (mock only)");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
