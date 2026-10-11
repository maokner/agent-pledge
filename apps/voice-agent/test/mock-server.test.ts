import { describe, expect, it } from "vitest";
import {
  createMockContext,
  handleRequest,
  randomPin,
  randomTaskId,
  type MockContext,
  type MockRequest,
} from "../src/mock-server.js";
import {
  createTaskOutputSchema,
  taskStatusOutputSchema,
  toolErrorSchema,
} from "../src/contract.js";
import { SAMPLE_NORMAL_CALL } from "../src/samples.js";

const SECRET = "test-secret";

function ctx(overrides: Partial<MockContext> = {}): MockContext {
  let n = 0;
  return createMockContext({
    secret: SECRET,
    boardUrl: "https://board.example/board",
    newPin: () => "0427",
    newTaskId: () => `task_${++n}`,
    ...overrides,
  });
}

function req(
  method: string,
  url: string,
  body?: unknown,
  secret: string | null = SECRET,
): MockRequest {
  return {
    method,
    url,
    headers: secret === null ? {} : { "x-agent-pledge-secret": secret },
    body: body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body),
  };
}

describe("create_task", () => {
  it("returns task_id, pin, and board_url for a valid task", () => {
    const c = ctx();
    const res = handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    expect(res.status).toBe(200);
    expect(createTaskOutputSchema.parse(res.body)).toEqual({
      task_id: "task_1",
      pin: "0427",
      board_url: "https://board.example/board",
    });
    expect(c.tasks.get("task_1")?.input).toEqual(SAMPLE_NORMAL_CALL);
  });

  it("keeps a PIN with a leading zero as a 4-character string", () => {
    const res = handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), ctx());
    expect((res.body as { pin: unknown }).pin).toBe("0427");
  });

  it("stores the values from the call, not fixed values (R9)", () => {
    const c = ctx();
    const other = {
      ...SAMPLE_NORMAL_CALL,
      call_id: "conv_other",
      place: "Doe Library",
      time_limit_minutes: 20,
      price_usd: 12.5,
    };
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    handleRequest(req("POST", "/tools/create_task", other), c);
    expect([...c.tasks.values()].map((t) => t.input)).toEqual([SAMPLE_NORMAL_CALL, other]);
  });

  it("never reuses a task id", () => {
    const ids = ["task_a", "task_a", "task_b"];
    const c = ctx({ newTaskId: () => ids.shift() ?? "task_z" });
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    const res = handleRequest(
      req("POST", "/tools/create_task", { ...SAMPLE_NORMAL_CALL, call_id: "conv_other" }),
      c,
    );
    expect((res.body as { task_id: string }).task_id).toBe("task_b");
  });

  it("returns the existing task for a repeated call_id instead of creating a new one", () => {
    let pins = 0;
    const c = ctx({ newPin: () => ["1111", "2222"][pins++] ?? "9999" });
    const first = handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    const retry = handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    expect(retry).toEqual(first);
    expect(retry.body).toEqual({
      task_id: "task_1",
      pin: "1111",
      board_url: "https://board.example/board",
    });
    expect(c.tasks.size).toBe(1);
  });

  it("returns the first task for a call_id even if a later request has other values", () => {
    const c = ctx();
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    const changed = { ...SAMPLE_NORMAL_CALL, price_usd: 9 };
    const res = handleRequest(req("POST", "/tools/create_task", changed), c);
    expect((res.body as { task_id: string }).task_id).toBe("task_1");
    expect(c.tasks.get("task_1")?.input).toEqual(SAMPLE_NORMAL_CALL);
    expect(c.tasks.size).toBe(1);
  });

  it.each([
    ["no call_id", undefined],
    ["an empty call_id", ""],
  ])("creates a new task each time for %s", (_label, callId) => {
    const c = ctx();
    const body = { ...SAMPLE_NORMAL_CALL, call_id: callId };
    handleRequest(req("POST", "/tools/create_task", body), c);
    handleRequest(req("POST", "/tools/create_task", body), c);
    expect(c.tasks.size).toBe(2);
  });

  it("still rejects an invalid body that repeats a known call_id", () => {
    const c = ctx();
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    const res = handleRequest(
      req("POST", "/tools/create_task", { ...SAMPLE_NORMAL_CALL, price_usd: 0 }),
      c,
    );
    expect(res.status).toBe(400);
  });

  it("creates the task on the first success after a failed attempt with the same call_id", () => {
    const c = ctx({ failMode: "create_task" });
    expect(handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c).status).toBe(
      503,
    );
    c.failMode = "none";
    const res = handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    expect(res.status).toBe(200);
    expect(c.tasks.size).toBe(1);
  });

  it.each([
    ["no secret", null],
    ["a wrong secret", "nope"],
    ["a secret of another length", `${SECRET}x`],
  ])("rejects %s with 401", (_label, secret) => {
    const res = handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL, secret), ctx());
    expect(res.status).toBe(401);
    expect(toolErrorSchema.parse(res.body).error).toBe("unauthorized");
  });

  it("rejects invalid JSON with 400", () => {
    const res = handleRequest(req("POST", "/tools/create_task", "{not json"), ctx());
    expect(res.status).toBe(400);
    expect(toolErrorSchema.parse(res.body).error).toBe("invalid_json");
  });

  it.each([
    ["a missing price", { price_usd: undefined }, "price_usd"],
    ["a zero price", { price_usd: 0 }, "price_usd"],
    ["a price as text", { price_usd: "5" }, "price_usd"],
    ["a fractional time limit", { time_limit_minutes: 2.5 }, "time_limit_minutes"],
    ["a zero time limit (right now)", { time_limit_minutes: 0 }, "time_limit_minutes"],
    ["an empty place", { place: "  " }, "place"],
    ["an unknown field", { tip: 1 }, "Unrecognized key"],
  ])("rejects %s with 400", (_label, patch, expected) => {
    const body = { ...SAMPLE_NORMAL_CALL, ...patch };
    const res = handleRequest(req("POST", "/tools/create_task", body), ctx());
    expect(res.status).toBe(400);
    const err = toolErrorSchema.parse(res.body);
    expect(err.error).toBe("invalid_input");
    expect(JSON.stringify(err.details ?? [])).toContain(expected);
  });

  it("accepts an empty caller_phone from a dashboard test call", () => {
    const res = handleRequest(
      req("POST", "/tools/create_task", { ...SAMPLE_NORMAL_CALL, caller_phone: "" }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("returns 503 and no PIN in fail mode", () => {
    for (const failMode of ["create_task", "all"] as const) {
      const c = ctx({ failMode });
      const res = handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
      expect(res.status).toBe(503);
      expect(res.body).not.toHaveProperty("pin");
      expect(c.tasks.size).toBe(0);
    }
  });

  it("only accepts POST", () => {
    expect(handleRequest(req("GET", "/tools/create_task"), ctx()).status).toBe(405);
  });
});

describe("task_status", () => {
  it("returns open and a null note for a new task", () => {
    const c = ctx();
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    const res = handleRequest(req("GET", "/tools/task_status/task_1"), c);
    expect(res.status).toBe(200);
    expect(taskStatusOutputSchema.parse(res.body)).toEqual({ status: "open", helper_note: null });
  });

  it("reflects a status set through the mock route", () => {
    const c = ctx();
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    const set = handleRequest(
      req("POST", "/mock/tasks/task_1", { status: "done", helper_note: "Front table, left side" }),
      c,
    );
    expect(set.status).toBe(200);
    const res = handleRequest(req("GET", "/tools/task_status/task_1?ignored=1"), c);
    expect(res.body).toEqual({ status: "done", helper_note: "Front table, left side" });
  });

  it("rejects an unknown status on the mock route", () => {
    const c = ctx();
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    expect(handleRequest(req("POST", "/mock/tasks/task_1", { status: "paid" }), c).status).toBe(
      400,
    );
  });

  it("returns 404 for an unknown or empty task id", () => {
    expect(handleRequest(req("GET", "/tools/task_status/task_404"), ctx()).status).toBe(404);
    expect(handleRequest(req("GET", "/tools/task_status/"), ctx()).status).toBe(404);
    expect(handleRequest(req("GET", "/tools/task_status/%E0%A4%A"), ctx()).status).toBe(404);
  });

  it("requires the secret", () => {
    expect(
      handleRequest(req("GET", "/tools/task_status/task_1", undefined, null), ctx()).status,
    ).toBe(401);
  });

  it("returns 503 in fail mode", () => {
    expect(
      handleRequest(req("GET", "/tools/task_status/task_1"), ctx({ failMode: "task_status" }))
        .status,
    ).toBe(503);
  });
});

describe("other routes", () => {
  it("serves /health without the secret", () => {
    expect(handleRequest(req("GET", "/health", undefined, null), ctx())).toEqual({
      status: 200,
      body: { ok: true, fail_mode: "none" },
    });
  });

  it("returns 404 for unknown paths before checking the secret", () => {
    expect(handleRequest(req("GET", "/nope", undefined, null), ctx()).status).toBe(404);
  });

  it("lists tasks on /mock/tasks with the secret only", () => {
    const c = ctx();
    handleRequest(req("POST", "/tools/create_task", SAMPLE_NORMAL_CALL), c);
    expect(handleRequest(req("GET", "/mock/tasks", undefined, null), c).status).toBe(401);
    expect(handleRequest(req("GET", "/mock/tasks"), c).body).toHaveLength(1);
  });
});

describe("random values", () => {
  it("makes 4-digit PINs and prefixed task ids", () => {
    for (let i = 0; i < 200; i++) expect(randomPin()).toMatch(/^\d{4}$/);
    expect(randomTaskId()).toMatch(/^task_[0-9a-f]{12}$/);
    expect(new Set(Array.from({ length: 100 }, randomTaskId)).size).toBe(100);
  });
});
