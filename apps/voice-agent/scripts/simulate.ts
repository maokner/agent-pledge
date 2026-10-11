/**
 * Sends the sample tool payloads and checks the response shapes.
 * Usage:
 *   pnpm simulate                      start an in-process mock server and test it
 *   pnpm simulate --url <base-url>     test a running server (mock or real), using VOICE_TOOL_SECRET
 */
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import { createMockContext, createMockHttpServer } from "../src/mock-server.js";
import { loadDotEnv } from "../src/paths.js";
import { runSimulation, type CheckResult } from "../src/simulate.js";
import { CREATE_TASK_PATH, VOICE_SECRET_HEADER } from "../src/contract.js";
import { SAMPLE_SERVER_ERROR_CALL } from "../src/samples.js";

loadDotEnv();

const { values } = parseArgs({
  options: { url: { type: "string" }, help: { type: "boolean", short: "h" } },
});

if (values.help) {
  console.log("Usage: pnpm simulate [--url <base-url>]");
  process.exit(0);
}

function print(results: CheckResult[]): boolean {
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`);
  return results.every((r) => r.ok);
}

async function listen(server: ReturnType<typeof createMockHttpServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function main(): Promise<boolean> {
  if (values.url) {
    const secret = process.env.VOICE_TOOL_SECRET;
    if (!secret) throw new Error("Set VOICE_TOOL_SECRET to the secret that the server expects.");
    console.log(`Testing ${values.url}`);
    return print(await runSimulation({ baseUrl: values.url, secret }));
  }

  const secret = "simulate-secret";
  const ok = createMockHttpServer(
    createMockContext({ secret, boardUrl: "https://board.example/board" }),
  );
  const failing = createMockHttpServer(
    createMockContext({ secret, boardUrl: "https://board.example/board", failMode: "all" }),
  );
  try {
    const okUrl = await listen(ok);
    console.log(`Testing an in-process mock server at ${okUrl}`);
    const results = await runSimulation({ baseUrl: okUrl, secret });

    // Transcript 04: the server fails, so the agent must not get a PIN.
    const failUrl = await listen(failing);
    const res = await fetch(new URL(CREATE_TASK_PATH, failUrl), {
      method: "POST",
      headers: { "content-type": "application/json", [VOICE_SECRET_HEADER]: secret },
      body: JSON.stringify(SAMPLE_SERVER_ERROR_CALL),
    });
    const body = (await res.json()) as Record<string, unknown>;
    results.push({
      name: "create_task: server error returns no PIN (transcript 04)",
      ok: res.status === 503 && !("pin" in body),
      detail: `HTTP ${res.status} ${JSON.stringify(body)}`,
    });
    return print(results);
  } finally {
    ok.close();
    failing.close();
  }
}

main().then(
  (ok) => {
    console.log(ok ? "\nAll checks passed." : "\nSome checks failed.");
    process.exit(ok ? 0 : 1);
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
