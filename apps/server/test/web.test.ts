import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { buildTestApp, type TestApp } from "./helpers";

/** What the fake web app saw. */
interface Echo {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

/** A stand-in for the Next.js server: echoes each request, and accepts the dev hot reload socket. */
async function startFakeWeb(): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.url === "/redirect-me") {
        res.writeHead(307, { location: "/board?task=task_1" }).end();
        return;
      }
      const echo: Echo = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      res.writeHead(200, { "content-type": "application/json", "x-from": "web" });
      res.end(JSON.stringify(echo));
    });
  });
  const wss = new WebSocketServer({ server, path: "/_next/webpack-hmr" });
  wss.on("connection", (socket) => socket.send("hmr-hello"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((r) => {
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(() => r());
      }),
  };
}

/** Opens a socket and resolves with its first message. */
function firstMessage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("message", (raw) => {
      resolve(String(raw));
      ws.close();
    });
    ws.once("error", reject);
  });
}

describe("web app proxy", () => {
  let web: Awaited<ReturnType<typeof startFakeWeb>>;
  let t: TestApp;
  let base: string;
  beforeAll(async () => {
    web = await startFakeWeb();
    t = await buildTestApp({ config: { WEB_UPSTREAM_URL: web.url } });
    await t.app.listen({ port: 0, host: "127.0.0.1" });
    base = `127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await t.close();
    await web.close();
  });

  const get = async (url: string, headers: Record<string, string> = {}) =>
    t.app.inject({ method: "GET", url, headers });

  it("proxies the pages, keeping the path and query", async () => {
    for (const url of [
      "/",
      "/?task=task_1",
      "/board?task=task_1",
      "/c/AB23",
      "/human",
      "/_next/static/chunks/app.js",
      "/favicon.ico",
      "/fixtures/seat-photo.svg",
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(200);
      expect(res.headers["x-from"], url).toBe("web");
      expect((res.json() as Echo).url, url).toBe(url);
    }
  });

  it("passes the public host and scheme on to the web app", async () => {
    const res = await get("/board", {
      host: "demo.trycloudflare.com",
      "x-forwarded-proto": "https",
    });
    const echo = res.json() as Echo;
    expect(echo.headers["x-forwarded-host"]).toBe("demo.trycloudflare.com");
    expect(echo.headers["x-forwarded-proto"]).toBe("https");
  });

  it("proxies the web app's own route handlers with their body", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/backup-task",
      headers: { "content-type": "application/json", "x-backup-passcode": "pw" },
      payload: JSON.stringify({ description: "Save me a seat" }),
    });
    expect(res.statusCode).toBe(200);
    const echo = res.json() as Echo;
    expect(echo.method).toBe("POST");
    expect(echo.headers["x-backup-passcode"]).toBe("pw");
    expect(JSON.parse(echo.body)).toEqual({ description: "Save me a seat" });
  });

  it("passes the web app's relative redirects through", async () => {
    const res = await get("/redirect-me");
    expect(res.statusCode).toBe(307);
    expect(res.headers.location).toBe("/board?task=task_1");
  });

  it("never shadows an API route", async () => {
    const board = await get("/board/state");
    expect(board.statusCode).toBe(200);
    expect(board.headers["x-from"]).toBeUndefined();
    expect(board.json()).toHaveProperty("tasks");
    expect((await get("/health")).statusCode).toBe(200);
    const claim = await get("/claim/AB23");
    expect(claim.statusCode).toBe(404);
    expect(claim.json().error).toBe("not_found");
  });

  it("keeps the API's JSON 404 under the API's own prefixes", async () => {
    for (const url of [
      "/agent/nope",
      "/tools/nope",
      "/claim/AB23/nope",
      "/media/nope/x",
      "/ws/x",
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(404);
      expect(res.headers["x-from"], url).toBeUndefined();
      expect(res.json().error, url).toBe("not_found");
    }
  });

  it("keeps CORS preflights on the API", async () => {
    const res = await t.app.inject({
      method: "OPTIONS",
      url: "/claim/AB23/photo",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("serves the board socket itself, and proxies only the dev hot reload socket", async () => {
    const snapshot = JSON.parse(await firstMessage(`ws://${base}/ws/board`));
    expect(snapshot.type).toBe("snapshot");
    expect(await firstMessage(`ws://${base}/_next/webpack-hmr`)).toBe("hmr-hello");
  });
});

describe("web app proxy, upstream down", () => {
  let t: TestApp;
  beforeAll(async () => {
    // Port 9 (discard) has nothing listening on a dev machine or in CI.
    t = await buildTestApp({ config: { WEB_UPSTREAM_URL: "http://127.0.0.1:9" } });
  });
  afterAll(() => t.close());

  it("answers 502 with a hint instead of hanging", async () => {
    const res = await t.app.inject({ method: "GET", url: "/board" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("web_unavailable");
    expect((await t.app.inject({ method: "GET", url: "/board/state" })).statusCode).toBe(200);
  });
});

describe("without WEB_UPSTREAM_URL", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it("serves only the API, with JSON 404s for everything else", async () => {
    const page = await t.app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(404);
    expect(page.headers["content-type"]).toContain("application/json");
    expect((await t.app.inject({ method: "GET", url: "/board/state" })).statusCode).toBe(200);
  });
});
