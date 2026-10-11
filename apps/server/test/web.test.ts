import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers";

let t: TestApp;
beforeAll(async () => {
  t = await buildTestApp();
});
afterAll(() => t.close());

describe("web pages", () => {
  it("serves the board at /", async () => {
    const res = await t.app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("/js/board.js");
  });

  it("serves the claim page at /c/:code", async () => {
    const res = await t.app.inject({ method: "GET", url: "/c/AB23" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("/js/claim.js");
  });

  it("serves the page assets", async () => {
    for (const url of ["/js/board.js", "/js/claim.js", "/css/board.css", "/css/claim.css"]) {
      expect((await t.app.inject({ method: "GET", url })).statusCode, url).toBe(200);
    }
  });

  it("keeps the JSON API and its 404s", async () => {
    const claim = await t.app.inject({ method: "GET", url: "/claim/AB23" });
    expect(claim.statusCode).toBe(404);
    expect(claim.json().error).toBe("not_found");
    const board = await t.app.inject({ method: "GET", url: "/board/state" });
    expect(board.statusCode).toBe(200);
    expect(board.json()).toHaveProperty("tasks");
    const unknown = await t.app.inject({ method: "GET", url: "/no/such/path" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.headers["content-type"]).toContain("application/json");
  });
});
