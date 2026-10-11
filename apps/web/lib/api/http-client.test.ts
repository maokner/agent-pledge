import { describe, expect, it, vi } from "vitest";
import { backendBoardState, backendLogEntry, backendSubtask, backendTask, backendTx } from "../backend/test-payloads";
import { ApiError } from "./client";
import { createHttpApiClient } from "./http-client";

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("createHttpApiClient", () => {
  it("calls the contract path on the configured server and returns the body", async () => {
    const fetch = respond(200, { code: "7Q2K", state: "open" });
    const api = createHttpApiClient({ baseUrl: "https://pledge.example", fetch });

    const claim = await api.getClaim("7Q2K");

    expect(fetch).toHaveBeenCalledWith("https://pledge.example/claim/7Q2K", expect.objectContaining({ method: "GET", credentials: "include" }));
    expect(claim.state).toBe("open");
  });

  it("turns an error response into an ApiError with the contract error code", async () => {
    const fetch = respond(409, { error: "already_claimed", message: "Someone else claimed this first." });
    const api = createHttpApiClient({ baseUrl: "", fetch });

    const error = await api.claimSubtask("7Q2K").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "already_claimed", message: "Someone else claimed this first." });
  });

  it("lists open sub-tasks from the draft GET /subtasks/open", async () => {
    const body = { server_time: "2026-10-11T19:00:00.000Z", subtasks: [{ claim_code: "7Q2K", price: "4" }] };
    const fetch = respond(200, body);
    const api = createHttpApiClient({ baseUrl: "https://pledge.example", fetch });

    const list = await api.listOpenSubtasks();

    expect(fetch).toHaveBeenCalledWith("https://pledge.example/subtasks/open", expect.objectContaining({ method: "GET" }));
    expect(list).toEqual(body);
  });

  it("flattens the server's nested GET /board/state into the board's snapshot", async () => {
    const task = backendTask({ subtasks: [backendSubtask()], transactions: [backendTx()] });
    const fetch = respond(200, backendBoardState({ seq: 1760205600007, tasks: [task], agent_log: [backendLogEntry({ id: 2 }), backendLogEntry({ id: 1 })] }));
    const api = createHttpApiClient({ baseUrl: "http://localhost:3001", fetch });

    const board = await api.getBoardState();

    expect(fetch).toHaveBeenCalledWith("http://localhost:3001/board/state", expect.objectContaining({ method: "GET" }));
    expect(board.seq).toBe(1760205600007);
    expect(board.tasks.map((t) => t.id)).toEqual([task.id]);
    expect(board.subtasks.map((s) => s.description)).toEqual(["Save me a seat at the front table"]);
    expect(board.txs.map((tx) => tx.kind)).toEqual(["task_escrow"]);
    expect(board.agent_log.map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("reports a non-JSON error as internal", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("Bad gateway", { status: 502 }));
    const api = createHttpApiClient({ baseUrl: "", fetch });

    const error = await api.getBoardState().catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 502, code: "internal" });
  });

  describe("uploadPhoto", () => {
    it("posts the photo and note to the contract path with the helper cookie, and reports progress", async () => {
      const xhr = new FakeXhr();
      const api = createHttpApiClient({ baseUrl: "https://pledge.example", xhr: () => xhr as unknown as XMLHttpRequest });
      const progress: number[] = [];

      const upload = api.uploadPhoto("7Q2K", new Blob(["jpeg"]), "Front table", { onProgress: (p) => progress.push(p) });
      xhr.progress(50, 100);
      xhr.respond(200, { code: "7Q2K", state: "claimed_by_you" });

      expect(await upload).toMatchObject({ state: "claimed_by_you" });
      expect(xhr.opened).toEqual(["POST", "https://pledge.example/claim/7Q2K/photo"]);
      expect(xhr.withCredentials).toBe(true);
      expect((xhr.sent as FormData).get("note")).toBe("Front table");
      expect((xhr.sent as FormData).get("photo")).toBeInstanceOf(Blob);
      expect(progress).toEqual([0.5, 1]);
    });

    it("turns an error response into an ApiError", async () => {
      const xhr = new FakeXhr();
      const api = createHttpApiClient({ baseUrl: "", xhr: () => xhr as unknown as XMLHttpRequest });

      const upload = api.uploadPhoto("7Q2K", new Blob(["x"]), "").catch((e: unknown) => e);
      xhr.respond(410, { error: "expired", message: "Time ran out." });

      expect(await upload).toMatchObject({ status: 410, code: "expired", message: "Time ran out." });
    });

    it("rejects with a TypeError when the connection drops, like fetch", async () => {
      const xhr = new FakeXhr();
      const api = createHttpApiClient({ baseUrl: "", xhr: () => xhr as unknown as XMLHttpRequest });

      const upload = api.uploadPhoto("7Q2K", new Blob(["x"]), "").catch((e: unknown) => e);
      xhr.fire("error");

      expect(await upload).toBeInstanceOf(TypeError);
    });

    it("aborts with an AbortError when the signal fires", async () => {
      const xhr = new FakeXhr();
      const api = createHttpApiClient({ baseUrl: "", xhr: () => xhr as unknown as XMLHttpRequest });
      const controller = new AbortController();

      const upload = api.uploadPhoto("7Q2K", new Blob(["x"]), "", { signal: controller.signal }).catch((e: unknown) => e);
      controller.abort();

      expect(xhr.aborted).toBe(true);
      expect(await upload).toMatchObject({ name: "AbortError" });
    });
  });
});

/** The parts of XMLHttpRequest the upload uses. */
class FakeXhr {
  opened: string[] = [];
  sent: unknown;
  withCredentials = false;
  aborted = false;
  status = 0;
  responseText = "";
  upload = new EventTarget();
  private events = new EventTarget();

  open(method: string, url: string) {
    this.opened = [method, url];
  }
  send(body: unknown) {
    this.sent = body;
  }
  abort() {
    this.aborted = true;
    this.fire("abort");
  }
  addEventListener(type: string, listener: EventListener) {
    this.events.addEventListener(type, listener);
  }
  fire(type: string) {
    this.events.dispatchEvent(new Event(type));
  }
  progress(loaded: number, total: number) {
    this.upload.dispatchEvent(Object.assign(new Event("progress"), { loaded, total, lengthComputable: true }));
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.fire("load");
  }
}
