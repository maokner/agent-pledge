import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentHeaders, buildTestApp, type TestApp, voiceHeaders } from "./helpers";

let t: TestApp;
beforeAll(async () => {
  t = await buildTestApp();
});
afterAll(() => t.close());

describe("app", () => {
  it("GET /health returns 200", async () => {
    const res = await t.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, ledger_mode: "fake" });
  });

  it("protects voice tools and agent routes", async () => {
    expect(
      (await t.app.inject({ method: "POST", url: "/tools/create_task", payload: {} })).statusCode,
    ).toBe(401);
    expect((await t.app.inject({ method: "GET", url: "/agent/tasks/x" })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "POST", url: "/admin/tasks/x/fail" })).statusCode).toBe(
      401,
    );
    // With auth, stubs answer 501 until the bundles implement them.
    const r = await t.app.inject({
      method: "POST",
      url: "/tools/create_task",
      headers: voiceHeaders,
      payload: {},
    });
    expect([400, 501]).toContain(r.statusCode);
    const a = await t.app.inject({ method: "GET", url: "/agent/tasks/x", headers: agentHeaders });
    expect([404, 501]).toContain(a.statusCode);
  });

  it("routes /tasks/:id.json with the id param", async () => {
    const res = await t.app.inject({ method: "GET", url: "/tasks/sub_abc.json" });
    // The route matched (our not_found body for an unknown ID, not Fastify's route-not-found).
    expect(res.json().error).toBe("not_found");
    expect(res.json().message).toContain("sub_abc");
  });

  it("records the system wallets", async () => {
    const rows = await t.db.query.wallets.findMany();
    expect(rows.map((r) => r.role).sort()).toEqual(["agent", "vault"]);
  });
});
