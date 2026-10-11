import { describe, expect, it } from "vitest";
import { createMockContext, handleRequest, type MockContext } from "../src/mock-server.js";
import { runSimulation, type FetchLike } from "../src/simulate.js";

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
    expect(results).toHaveLength(7);
    expect(ctx.tasks.size).toBe(2);
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
