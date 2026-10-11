import { describe, expect, it } from "vitest";
import { createMockContext, handleRequest, type MockContext } from "../src/mock-server.js";
import {
  describeServerCheck,
  joinUrl,
  networkReason,
  runServerCheck,
  runSimulation,
  type FetchLike,
} from "../src/simulate.js";

/** Routes fetch calls straight into handleRequest, so no socket is opened. */
function inMemoryFetch(ctx: MockContext): FetchLike {
  return async (url, init) => {
    const { pathname, search } = new URL(url);
    const res = handleRequest(
      {
        method: init.method ?? "GET",
        url: pathname + search,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body: typeof init.body === "string" ? init.body : "",
      },
      ctx,
    );
    return new Response(JSON.stringify(res.body), { status: res.status });
  };
}

describe("runSimulation", () => {
  it("passes every check against the mock server", async () => {
    const ctx = createMockContext({ secret: "s", boardUrl: "https://board.example/board" });
    const results = await runSimulation({
      baseUrl: "http://mock.local",
      secret: "s",
      fetchFn: inMemoryFetch(ctx),
    });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results).toHaveLength(9);
    expect(ctx.tasks.size).toBe(2);
  });

  it("uses a new call_id for each simulated call, so a rerun does not reuse old tasks", async () => {
    const ctx = createMockContext({ secret: "s", boardUrl: "https://board.example/board" });
    await runSimulation({ baseUrl: "http://mock.local", secret: "s", fetchFn: inMemoryFetch(ctx) });
    await runSimulation({ baseUrl: "http://mock.local", secret: "s", fetchFn: inMemoryFetch(ctx) });
    const callIds = [...ctx.tasks.values()].map((t) => t.input.call_id);
    expect(callIds).toHaveLength(4);
    expect(new Set(callIds).size).toBe(4);
    expect(callIds.every((id) => id?.startsWith("conv_simulate_"))).toBe(true);
  });

  it("reports a failure when the server does not dedupe on call_id", async () => {
    const ctx = createMockContext({ secret: "s", boardUrl: "https://board.example/board" });
    const fetchFn = inMemoryFetch(ctx);
    const dropsCallId: FetchLike = (url, init) => {
      if (typeof init.body !== "string") return fetchFn(url, init);
      const body = JSON.parse(init.body) as Record<string, unknown>;
      delete body.call_id;
      return fetchFn(url, { ...init, body: JSON.stringify(body) });
    };
    const results = await runSimulation({
      baseUrl: "http://mock.local",
      secret: "s",
      fetchFn: dropsCallId,
    });
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "create_task: a retry with the same call_id returns the same task",
    ]);
  });

  it("reports a failure when the server returns a bad PIN", async () => {
    const ctx = createMockContext({
      secret: "s",
      boardUrl: "https://board.example/board",
      newPin: () => "12345",
    });
    const results = await runSimulation({
      baseUrl: "http://mock.local",
      secret: "s",
      fetchFn: inMemoryFetch(ctx),
    });
    const failed = results.filter((r) => !r.ok).map((r) => r.name);
    expect(failed).toContain("create_task: normal call (transcript 01)");
    expect(results.find((r) => r.name.startsWith("create_task: normal"))?.detail).toContain("pin");
  });

  it("reports a failure when the server ignores the secret", async () => {
    const ctx = createMockContext({ secret: "s", boardUrl: "https://board.example/board" });
    const fetchFn = inMemoryFetch(ctx);
    const ignoresSecret: FetchLike = (url, init) =>
      fetchFn(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), "x-voice-secret": "s" },
      });
    const results = await runSimulation({
      baseUrl: "http://mock.local",
      secret: "s",
      fetchFn: ignoresSecret,
    });
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "create_task: wrong secret is rejected",
      "create_task: missing secret is rejected",
    ]);
  });
});

describe("runServerCheck", () => {
  it("passes against the mock server and creates no task", async () => {
    const ctx = createMockContext({ secret: "s", boardUrl: "https://board.example/board" });
    const results = await runServerCheck({
      baseUrl: "http://mock.local",
      secret: "s",
      fetchFn: inMemoryFetch(ctx),
    });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.map((r) => r.name)).toEqual([
      "server: GET /health answers 200",
      "create_task: wrong secret is rejected",
      "create_task: missing secret is rejected",
      "create_task: missing price is rejected",
      "task_status: unknown task is 404",
    ]);
    expect(ctx.tasks.size).toBe(0);
  });

  it("fails when the server expects another secret", async () => {
    const ctx = createMockContext({ secret: "other", boardUrl: "https://board.example/board" });
    const results = await runServerCheck({
      baseUrl: "http://mock.local",
      secret: "s",
      fetchFn: inMemoryFetch(ctx),
    });
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "create_task: missing price is rejected",
      "task_status: unknown task is 404",
    ]);
  });

  it("creates no task even on a server that ignores the secret", async () => {
    const ctx = createMockContext({ secret: "s", boardUrl: "https://board.example/board" });
    const fetchFn = inMemoryFetch(ctx);
    const ignoresSecret: FetchLike = (url, init) =>
      fetchFn(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), "x-voice-secret": "s" },
      });
    const results = await runServerCheck({
      baseUrl: "http://mock.local",
      secret: "s",
      fetchFn: ignoresSecret,
    });
    expect(results.filter((r) => !r.ok)).toHaveLength(2);
    expect(ctx.tasks.size).toBe(0);
  });

  it("reports a server that does not answer as a failed check", async () => {
    const down: FetchLike = () => Promise.reject(new TypeError("fetch failed"));
    const results = await runServerCheck({
      baseUrl: "https://down.example",
      secret: "s",
      fetchFn: down,
    });
    expect(results.every((r) => !r.ok && r.detail.startsWith("no answer:"))).toBe(true);
  });

  it("describes every check for the dry run", () => {
    expect(describeServerCheck("https://pledge.example.com")).toEqual([
      "GET https://pledge.example.com/health with no secret: expect HTTP 200",
      "POST https://pledge.example.com/tools/create_task with a wrong secret: expect HTTP 401",
      "POST https://pledge.example.com/tools/create_task with no secret: expect HTTP 401",
      "POST https://pledge.example.com/tools/create_task with VOICE_TOOL_SECRET: expect HTTP 400",
      "GET https://pledge.example.com/tools/task_status/task_does_not_exist with VOICE_TOOL_SECRET: expect HTTP 404",
    ]);
  });
});

describe("joinUrl", () => {
  it("keeps a path in the base URL, like the tool templates", () => {
    expect(joinUrl("https://x.example/api/", "/tools/create_task")).toBe(
      "https://x.example/api/tools/create_task",
    );
    expect(joinUrl("https://x.example", "/health")).toBe("https://x.example/health");
  });
});

describe("networkReason", () => {
  it("finds the system error code inside fetch errors", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8791"), {
      code: "ECONNREFUSED",
    });
    const err = new TypeError("fetch failed", { cause: new AggregateError([refused]) });
    expect(networkReason(err)).toBe("connect ECONNREFUSED 127.0.0.1:8791");
    const dns = Object.assign(new Error("getaddrinfo failed"), { code: "ENOTFOUND" });
    expect(networkReason(new TypeError("fetch failed", { cause: dns }))).toBe(
      "ENOTFOUND getaddrinfo failed",
    );
    expect(networkReason("plain")).toBe("plain");
  });
});
