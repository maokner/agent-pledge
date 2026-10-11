import { describe, expect, it, vi } from "vitest";
import { createHelperTokenStore, type HelperTokenStore } from "../backend/claim";
import {
  backendBoardState,
  backendClaim,
  backendLogEntry,
  backendMedia,
  backendSubtask,
  backendTask,
  backendTx,
  hash,
} from "../backend/test-payloads";
import { ApiError } from "./client";
import { createHttpApiClient } from "./http-client";

const BASE = "http://localhost:3001";
const NOW = Date.parse("2026-10-11T18:01:00.000Z");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Route = Response | ((init: RequestInit | undefined) => Response);

/** A fake server: "METHOD /path" -> response, or a queue of responses served in order. */
function server(routes: Record<string, Route | Route[]>) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input).replace(BASE, "")}`;
    const route = routes[key];
    const next = Array.isArray(route) ? route.shift() : route;
    if (!next) throw new Error(`no route for ${key}`);
    return typeof next === "function" ? next(init) : next.clone();
  });
}

function memoryTokens(): HelperTokenStore {
  const items = new Map<string, string>();
  const storage = {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  } as Storage;
  return createHelperTokenStore(() => storage);
}

const boardWithSub = () =>
  backendBoardState({
    tasks: [backendTask({ time_limit_minutes: 3, subtasks: [backendSubtask({ created_at: "2026-10-11T18:00:00.000Z" })] })],
  });

function client(routes: Record<string, Route | Route[]>, tokens = memoryTokens()) {
  const fetch = server({ "GET /board/state": json(200, boardWithSub()), ...routes });
  return { api: createHttpApiClient({ baseUrl: BASE, fetch, tokens, now: () => NOW }), fetch, tokens };
}

const header = (fetch: ReturnType<typeof server>, call: number, name: string) =>
  new Headers(fetch.mock.calls[call]?.[1]?.headers).get(name);

describe("createHttpApiClient against the real server", () => {
  it("flattens the server's nested GET /board/state into the board's snapshot", async () => {
    const task = backendTask({ subtasks: [backendSubtask()], transactions: [backendTx()] });
    const { api, fetch } = client({
      "GET /board/state": json(200, backendBoardState({ seq: 1760205600007, tasks: [task], agent_log: [backendLogEntry({ id: 2 }), backendLogEntry({ id: 1 })] })),
    });

    const board = await api.getBoardState();

    expect(fetch).toHaveBeenCalledWith(`${BASE}/board/state`, expect.objectContaining({ method: "GET" }));
    expect(board.seq).toBe(1760205600007);
    expect(board.tasks.map((t) => t.id)).toEqual([task.id]);
    expect(board.subtasks.map((s) => s.description)).toEqual(["Save me a seat at the front table"]);
    expect(board.txs.map((tx) => tx.kind)).toEqual(["task_escrow"]);
    expect(board.agent_log.map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("reports a non-JSON error as internal", async () => {
    const { api } = client({ "GET /board/state": new Response("Bad gateway", { status: 502 }) });

    expect(await api.getBoardState().catch((e: unknown) => e)).toMatchObject({ status: 502, code: "internal" });
  });

  describe("getClaim", () => {
    it("derives the page's state, takes the time limit from the board, and sends no token before a claim", async () => {
      const { api, fetch } = client({ "GET /claim/7Q2K": json(200, backendClaim()) });

      const claim = await api.getClaim("7Q2K");

      expect(claim).toMatchObject({
        code: "7Q2K",
        state: "open",
        subtask: { description: "Save me a seat at the front table", place: "Main Stacks", time_limit_minutes: 3, price: "4.00" },
        server_time: "2026-10-11T18:01:00.000Z",
      });
      expect(header(fetch, 0, "x-helper-token")).toBeNull();
    });

    it("asks the board for the time limit once per sub-task", async () => {
      const { api, fetch } = client({ "GET /claim/7Q2K": json(200, backendClaim()) });

      await api.getClaim("7Q2K");
      await api.getClaim("7Q2K");

      expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/board/state"))).toHaveLength(1);
    });

    it("falls back to the minutes left when the board does not load", async () => {
      const { api } = client({ "GET /claim/7Q2K": json(200, backendClaim()), "GET /board/state": new Response("down", { status: 503 }) });

      expect((await api.getClaim("7Q2K")).subtask.time_limit_minutes).toBe(2);
    });

    it("maps 404 to not_found", async () => {
      const { api } = client({ "GET /claim/ZZZZ": json(404, { error: "not_found", message: "Unknown claim code" }) });

      expect(await api.getClaim("ZZZZ").catch((e: unknown) => e)).toMatchObject({ status: 404, code: "not_found" });
    });
  });

  describe("claimSubtask", () => {
    it("unwraps {helper_token, claim}, keeps the token for this code, and sends it from then on", async () => {
      const claimed = backendClaim({ status: "claimed", claimed_by_you: true });
      const { api, fetch, tokens } = client({
        "GET /claim/7Q2K": [json(200, backendClaim()), json(200, claimed)],
        "POST /claim/7Q2K/claim": json(200, { helper_token: "tok.sig", claim: claimed }),
      });

      const claim = await api.claimSubtask("7Q2K");
      await api.getClaim("7Q2K");

      expect(claim.state).toBe("claimed_by_you");
      expect(tokens.get("7Q2K")).toBe("tok.sig");
      const lastGet = fetch.mock.calls.findLastIndex(([url]) => String(url).endsWith("/claim/7Q2K"));
      expect(header(fetch, lastGet, "x-helper-token")).toBe("tok.sig");
    });

    it("does not post again when this phone already holds the claim (the server would answer 409)", async () => {
      const tokens = memoryTokens();
      tokens.set("7Q2K", "tok.sig");
      const { api, fetch } = client({ "GET /claim/7Q2K": json(200, backendClaim({ status: "claimed", claimed_by_you: true })) }, tokens);

      const claim = await api.claimSubtask("7Q2K");

      expect(claim.state).toBe("claimed_by_you");
      expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    });

    it("passes the server's 409 already_claimed and 410 expired through", async () => {
      const lost = client({
        "GET /claim/7Q2K": json(200, backendClaim()),
        "POST /claim/7Q2K/claim": json(409, { error: "already_claimed", message: "Someone already claimed this task" }),
      });
      const late = client({
        "GET /claim/7Q2K": json(200, backendClaim()),
        "POST /claim/7Q2K/claim": json(410, { error: "expired", message: "This task has expired" }),
      });

      expect(await lost.api.claimSubtask("7Q2K").catch((e: unknown) => e)).toMatchObject({ status: 409, code: "already_claimed" });
      expect(await late.api.claimSubtask("7Q2K").catch((e: unknown) => e)).toMatchObject({ status: 410, code: "expired" });
    });
  });

  describe("submitPin", () => {
    function withToken() {
      const tokens = memoryTokens();
      tokens.set("7Q2K", "tok.sig");
      return tokens;
    }
    const mine = (overrides = {}) => backendClaim({ status: "claimed", claimed_by_you: true, ...overrides });

    it("is 'correct' with the paid claim on 200, sending the token", async () => {
      const payout = { amount: "4.00", tx_hash: hash(9), explorer_url: `https://testnet.xrpl.org/transactions/${hash(9)}` };
      const paid = mine({ status: "done", pin: { attempts: 0, attempts_left: 3, locked: false, verified: true }, payout });
      const { api, fetch } = client({ "POST /claim/7Q2K/pin": json(200, { claim: paid, payout }) }, withToken());

      const { result, claim } = await api.submitPin("7Q2K", "4821");

      expect(result).toBe("correct");
      expect(claim.state).toBe("paid");
      expect(claim.payout).toMatchObject({ tx_hash: hash(9), explorer_url: payout.explorer_url });
      const pinCall = fetch.mock.calls.findIndex(([url]) => String(url).endsWith("/pin"));
      expect(header(fetch, pinCall, "x-helper-token")).toBe("tok.sig");
      expect(JSON.parse(String(fetch.mock.calls[pinCall]?.[1]?.body))).toEqual({ pin: "4821" });
    });

    it("turns 422 wrong_pin into a 'wrong' result with the tries left from details", async () => {
      const { api } = client(
        {
          "POST /claim/7Q2K/pin": json(422, { error: "wrong_pin", message: "Wrong PIN. 2 tries left.", details: { attempts: 1, attempts_left: 2 } }),
          "GET /claim/7Q2K": json(200, mine({ pin: { attempts: 1, attempts_left: 2, locked: false, verified: false } })),
        },
        withToken(),
      );

      const { result, claim } = await api.submitPin("7Q2K", "1111");

      expect(result).toBe("wrong");
      expect(claim.state).toBe("claimed_by_you");
      expect(claim.pin_attempts_left).toBe(2);
    });

    it("turns 423 pin_locked into a 'locked' result", async () => {
      const { api } = client(
        {
          "POST /claim/7Q2K/pin": json(423, { error: "pin_locked", message: "Too many wrong PINs.", details: { attempts: 3, attempts_left: 0 } }),
          "GET /claim/7Q2K": json(200, mine({ pin: { attempts: 3, attempts_left: 0, locked: true, verified: false } })),
        },
        withToken(),
      );

      const { result, claim } = await api.submitPin("7Q2K", "2222");

      expect(result).toBe("locked");
      expect(claim).toMatchObject({ state: "locked", pin_attempts_left: 0 });
    });

    it("still reports a wrong PIN when the claim does not reload, as an error the page shows", async () => {
      const { api } = client(
        {
          "POST /claim/7Q2K/pin": json(422, { error: "wrong_pin", message: "Wrong PIN. 1 try left.", details: { attempts: 2, attempts_left: 1 } }),
          "GET /claim/7Q2K": new Response("down", { status: 503 }),
        },
        withToken(),
      );

      expect(await api.submitPin("7Q2K", "1111").catch((e: unknown) => e)).toMatchObject({ code: "wrong_pin", message: "Wrong PIN. 1 try left." });
    });

    it("maps 401 (no token for this sub-task) to not_your_claim, and a lock without a reload to locked", async () => {
      const { api } = client({
        "POST /claim/7Q2K/pin": [
          json(401, { error: "unauthorized", message: "This sub-task was not claimed from this device" }),
          json(423, { error: "pin_locked", message: "Too many wrong PINs.", details: { attempts: 3, attempts_left: 0 } }),
        ],
        "GET /claim/7Q2K": new Response("down", { status: 503 }),
      });

      expect(await api.submitPin("7Q2K", "4821").catch((e: unknown) => e)).toMatchObject({ status: 401, code: "not_your_claim" });
      expect(await api.submitPin("7Q2K", "4821").catch((e: unknown) => e)).toMatchObject({ status: 423, code: "locked" });
    });
  });

  describe("uploadPhoto", () => {
    it("posts the photo as `file` with the note and the token, reports progress, and unwraps {claim, media}", async () => {
      const xhr = new FakeXhr();
      const tokens = memoryTokens();
      tokens.set("7Q2K", "tok.sig");
      const api = createHttpApiClient({
        baseUrl: BASE,
        fetch: server({ "GET /board/state": json(200, boardWithSub()) }),
        tokens,
        now: () => NOW,
        xhr: () => xhr as unknown as XMLHttpRequest,
      });
      const progress: number[] = [];

      const upload = api.uploadPhoto("7Q2K", new Blob(["jpeg"], { type: "image/jpeg" }), "Front table", { onProgress: (p) => progress.push(p) });
      xhr.progress(50, 100);
      xhr.respond(200, { claim: backendClaim({ status: "claimed", claimed_by_you: true, photo: backendMedia(), helper_note: "Front table" }), media: backendMedia() });
      const claim = await upload;

      expect(claim).toMatchObject({ state: "claimed_by_you", photo: { url: "http://localhost:3001/media/med_p0p0p0p0p0p0p0p0", note: "Front table" } });
      expect(xhr.opened).toEqual(["POST", `${BASE}/claim/7Q2K/photo`]);
      expect(xhr.headers["x-helper-token"]).toBe("tok.sig");
      expect(xhr.withCredentials).toBe(true);
      expect((xhr.sent as FormData).get("note")).toBe("Front table");
      expect((xhr.sent as FormData).get("file")).toBeInstanceOf(Blob);
      expect((xhr.sent as FormData).get("photo")).toBeNull();
      expect(progress).toEqual([0.5, 1]);
    });

    it("maps 401 to not_your_claim and passes 410 and 413 through", async () => {
      const results = [];
      for (const [status, body] of [
        [401, { error: "unauthorized", message: "You did not claim this task" }],
        [410, { error: "expired", message: "This task has expired" }],
        [413, { error: "payload_too_large", message: "The image is too large" }],
      ] as const) {
        const xhr = new FakeXhr();
        const api = createHttpApiClient({ baseUrl: "", tokens: memoryTokens(), xhr: () => xhr as unknown as XMLHttpRequest });
        const upload = api.uploadPhoto("7Q2K", new Blob(["x"]), "").catch((e: unknown) => e);
        xhr.respond(status, body);
        results.push(await upload);
      }

      expect(results).toMatchObject([
        { status: 401, code: "not_your_claim" },
        { status: 410, code: "expired" },
        { status: 413, code: "payload_too_large", message: "The image is too large" },
      ]);
      expect(results[0]).toBeInstanceOf(ApiError);
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

  describe("listOpenSubtasks (derived from GET /board/state; there is no /subtasks/open yet)", () => {
    it("lists open sub-tasks with an offer and time left, with the parent task's text, and the board's clock", async () => {
      const task = backendTask({
        status: "claimed",
        subtasks: [
          backendSubtask({ id: "sub_ready00000000000", claim_code: "7Q2K", offer_id: "OFFER1", deadline: "2026-10-11T18:03:00.000Z" }),
          backendSubtask({ id: "sub_notready00000000", claim_code: "ABCD", offer_id: null }),
          backendSubtask({ id: "sub_claimed000000000", claim_code: "EFGH", offer_id: "OFFER2", status: "claimed" }),
          backendSubtask({ id: "sub_late000000000000", claim_code: "JKMN", offer_id: "OFFER3", deadline: "2026-10-11T18:00:30.000Z" }),
        ],
      });
      const { api } = client({ "GET /board/state": json(200, backendBoardState({ generated_at: "2026-10-11T18:01:00.000Z", tasks: [task] })) });

      const list = await api.listOpenSubtasks();

      expect(list).toEqual({
        server_time: "2026-10-11T18:01:00.000Z",
        subtasks: [
          {
            claim_code: "7Q2K",
            price: "4.00",
            description: "Save me a seat at the front table",
            place: "Main Stacks",
            time_limit_minutes: 3,
            created_at: "2026-10-11T18:00:30.000Z",
            deadline_at: "2026-10-11T18:03:00.000Z",
          },
        ],
      });
    });
  });

  it("maps GET /tasks/:id.json", async () => {
    const { api } = client({
      "GET /tasks/sub_a1b2c3d4e5f6g7h8.json": json(200, {
        id: "sub_a1b2c3d4e5f6g7h8",
        kind: "subtask",
        description: "Save me a seat at the front table",
        place: "Main Stacks",
        price: "4.00",
        deadline: "2026-10-11T18:03:00.000Z",
        status: "open",
        nft_id: "SUBNFT",
        parent_task_id: "task_k3j9x0c2m1q8z7w4",
        parent_nft_id: "TASKNFT",
        board_url: "http://localhost:3000/?task=task_k3j9x0c2m1q8z7w4",
      }),
    });

    expect(await api.getTaskJson("sub_a1b2c3d4e5f6g7h8")).toEqual({
      id: "sub_a1b2c3d4e5f6g7h8",
      type: "subtask",
      description: "Save me a seat at the front table",
      place: "Main Stacks",
      time_limit_minutes: null,
      price: "4.00",
      created_at: null,
      deadline_at: "2026-10-11T18:03:00.000Z",
      status: "open",
      nft_id: "SUBNFT",
      parent_task_id: "task_k3j9x0c2m1q8z7w4",
      parent_nft_id: "TASKNFT",
      board_url: "http://localhost:3000/?task=task_k3j9x0c2m1q8z7w4",
    });
  });

  it("maps create_task's deadline, and its 422 not_seat_hold", async () => {
    const { api } = client({
      "POST /tools/create_task": [
        json(200, { task_id: "task_k3j9x0c2m1q8z7w4", pin: "4821", board_url: "http://localhost:3000/?task=task_k3j9x0c2m1q8z7w4", status: "open", price: "5.00", deadline: "2026-10-11T18:03:00.000Z" }),
        json(422, { error: "not_seat_hold", message: "Right now I can only save seats. This task is not a seat hold." }),
      ],
    });
    const body = { description: "Save me a seat", place: "Main Stacks", time_limit_minutes: 3, price_usd: 5 };

    expect(await api.createTask(body)).toEqual({
      task_id: "task_k3j9x0c2m1q8z7w4",
      pin: "4821",
      board_url: "http://localhost:3000/?task=task_k3j9x0c2m1q8z7w4",
      status: "open",
      price: "5.00",
      deadline_at: "2026-10-11T18:03:00.000Z",
    });
    expect(await api.createTask(body).catch((e: unknown) => e)).toMatchObject({ status: 422, code: "not_seat_hold" });
  });
});

/** The parts of XMLHttpRequest the upload uses. */
class FakeXhr {
  opened: string[] = [];
  headers: Record<string, string> = {};
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
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
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
