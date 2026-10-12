/**
 * End-to-end smoke test over HTTP and WebSocket, written only against docs/api.md and the zod schemas
 * in packages/shared/src. It plays the voice agent, the local agent, two helper phones, and the admin.
 *
 *   pnpm smoke                                     # http://localhost:3001 with the dev secrets
 *   SMOKE_API_URL=https://agent-pledge-api.onrender.com VOICE_SHARED_SECRET=... AGENT_TOKEN=... pnpm smoke
 *
 * Needs a server with LEDGER_MODE=fake: the agent steps omit tx hashes, so the server performs them with
 * the fake agent account (docs/api.md section 6). Stop the real local agent first; this script is the agent.
 * Works with either PROOF_MODE (the claim view's `proof` says which): photo (default) = the photo pays,
 * then POST /claim/:code/pay and the PIN return the same payout; pin = the PIN pays.
 *
 * Env: SMOKE_API_URL (default http://localhost:3001), VOICE_SHARED_SECRET, AGENT_TOKEN (default: the server's
 * dev secret), SMOKE_TIMEOUT_MS (default 20000, per wait), SMOKE_FLOWS=success,failure (default both),
 * SMOKE_AGENT_WS=0 to skip the /ws/agent checks.
 * Exit code 0 when every check passed, 1 otherwise.
 */
import { createHash } from "node:crypto";
import {
  AdminFailResponse,
  AgentServerMessage,
  ApiError,
  BoardEventSchema,
  BoardSnapshotMessage,
  BoardState,
  ClaimSubtaskResponse,
  ClaimTaskResponse,
  ClaimView,
  CreateSubtaskResponse,
  CreateTaskResponse,
  HealthResponse,
  NftUriData,
  PayResponse,
  PinErrorDetails,
  PinResponse,
  PhotoResponse,
  RedeemTaskResponse,
  ScreenshotResponse,
  TaskStatusResponse,
  TaskView,
  AgentLogResponse,
  fromCents,
  toCents,
} from "../packages/shared/src/index";
import type { TaskView as TaskViewT, TxKind } from "../packages/shared/src/index";

// ---------- config ----------

const DEV_SECRET = "dev-only-change-me-0123456789abcdef"; // apps/server/src/config.ts default
const API = (process.env.SMOKE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const WS_BASE = API.replace(/^http/, "ws");
const VOICE_SECRET = process.env.VOICE_SHARED_SECRET ?? DEV_SECRET;
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? DEV_SECRET;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 20_000);
const FLOWS = (process.env.SMOKE_FLOWS ?? "success,failure").split(",").map((s) => s.trim());
const USE_AGENT_WS = process.env.SMOKE_AGENT_WS !== "0";

const voiceAuth = { "x-agent-pledge-secret": VOICE_SECRET };
const agentAuth = { authorization: `Bearer ${AGENT_TOKEN}` };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// A valid 1x1 PNG: the "seat photo" and the "Yik Yak screenshot".
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// ---------- output and checks ----------

const t0 = Date.now();
let last = t0;
const softFailures: string[] = [];

class SmokeError extends Error {}

function log(msg: string) {
  const now = Date.now();
  const total = String(now - t0).padStart(6);
  const delta = `+${now - last}`.padStart(7);
  last = now;
  console.log(`[${total}ms ${delta}ms] ${msg}`);
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    log(`ok    ${name} (${Date.now() - start}ms)`);
    return result;
  } catch (err) {
    log(`FAIL  ${name} (${Date.now() - start}ms)`);
    throw err;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new SmokeError(msg);
}

/** A failed check that should not stop the flow (for example a missing board event). */
function soft(cond: unknown, msg: string) {
  if (!cond) {
    softFailures.push(msg);
    log(`WARN  ${msg}`);
  }
}

// ---------- HTTP ----------

interface Parser<T> {
  parse(x: unknown): T;
}

interface CallOpts<T> {
  headers?: Record<string, string>;
  json?: unknown;
  form?: FormData;
  /** Expected HTTP status (default 200). */
  expect?: number;
  schema?: Parser<T>;
}

async function call<T = unknown>(method: string, path: string, opts: CallOpts<T> = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  let body: string | FormData | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  const expect = opts.expect ?? 200;
  if (res.status !== expect) {
    const err = ApiError.safeParse(parsed);
    const why = err.success ? `${err.data.error}: ${err.data.message}` : text.slice(0, 300);
    throw new SmokeError(`${method} ${path}: expected HTTP ${expect}, got ${res.status} (${why})`);
  }
  if (expect >= 400) {
    const err = ApiError.safeParse(parsed);
    assert(err.success, `${method} ${path}: error body is not ApiError: ${text.slice(0, 300)}`);
  }
  if (!opts.schema) return parsed as T;
  try {
    return opts.schema.parse(parsed);
  } catch (e) {
    throw new SmokeError(
      `${method} ${path}: response does not match the contract: ${(e as Error).message.slice(0, 800)}`,
    );
  }
}

/** Calls an endpoint that must fail with `status` and ApiError code `code`; returns the error body. */
async function callError(
  method: string,
  path: string,
  status: number,
  code: string,
  opts: Omit<CallOpts<unknown>, "expect" | "schema"> = {},
): Promise<ApiError> {
  const body = ApiError.parse(await call(method, path, { ...opts, expect: status }));
  assert(body.error === code, `${method} ${path}: expected error "${code}", got "${body.error}"`);
  return body;
}

// ---------- WebSocket watcher ----------

interface Received {
  at: number;
  msg: { type?: string; [k: string]: unknown };
}

class WsWatch {
  readonly received: Received[] = [];
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  closed: string | null = null;

  constructor(
    readonly name: string,
    private readonly url: string,
    private readonly validate: (msg: unknown) => string | null,
  ) {}

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(
        () => reject(new SmokeError(`${this.name}: connect timeout`)),
        10_000,
      );
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new SmokeError(`${this.name}: WebSocket error connecting to ${this.url}`));
      });
      ws.addEventListener("close", (ev) => {
        this.closed = `closed with code ${ev.code}${ev.reason ? ` (${ev.reason})` : ""}`;
        clearTimeout(timer);
        reject(new SmokeError(`${this.name}: ${this.closed}`));
        this.notify();
      });
      ws.addEventListener("message", (ev) => {
        let msg: unknown;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          soft(false, `${this.name}: non-JSON message: ${String(ev.data).slice(0, 200)}`);
          return;
        }
        const problem = this.validate(msg);
        soft(!problem, `${this.name}: message does not match the contract: ${problem}`);
        this.received.push({ at: Date.now(), msg: msg as Received["msg"] });
        this.notify();
      });
    });
  }

  send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws?.close();
  }

  private notify() {
    for (const l of [...this.listeners]) l();
  }

  /** Resolves with the first message (already received or future) that matches. */
  waitFor(label: string, pred: (m: Received["msg"]) => boolean, timeoutMs = TIMEOUT_MS) {
    return new Promise<Received["msg"]>((resolve, reject) => {
      const check = () => {
        const hit = this.received.find((r) => pred(r.msg));
        if (hit) {
          done();
          resolve(hit.msg);
        } else if (this.closed) {
          done();
          reject(
            new SmokeError(`${this.name}: waiting for ${label}, but the socket ${this.closed}`),
          );
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new SmokeError(`${this.name}: no ${label} within ${timeoutMs}ms`));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
  }
}

function zodProblem(result: { success: boolean; error?: { message: string } }): string | null {
  return result.success ? null : (result.error?.message.slice(0, 500) ?? "invalid");
}

const validateBoard = (msg: unknown) => {
  const type = (msg as { type?: unknown })?.type;
  return zodProblem(
    type === "snapshot" ? BoardSnapshotMessage.safeParse(msg) : BoardEventSchema.safeParse(msg),
  );
};
const validateAgent = (msg: unknown) => zodProblem(AgentServerMessage.safeParse(msg));

/** Waits for a board event and logs its latency. Missing events are soft failures (R3: < 2 s). */
async function boardEvent(
  board: WsWatch | null,
  label: string,
  pred: (m: Received["msg"]) => boolean,
): Promise<void> {
  if (!board) {
    soft(false, `board: ${label} not checked (no board WebSocket)`);
    return;
  }
  const start = Date.now();
  try {
    await board.waitFor(label, pred);
    const ms = Date.now() - start;
    log(`      board event ${label} (${ms}ms after the call returned)`);
  } catch (e) {
    soft(false, (e as Error).message);
  }
}

const data = (m: Received["msg"]) => (m.data ?? {}) as Record<string, unknown>;
const evTask = (type: string, taskId: string) => (m: Received["msg"]) =>
  m.type === type && (data(m).task as { id?: string } | undefined)?.id === taskId;
const evSubtask = (type: string, subtaskId: string) => (m: Received["msg"]) =>
  m.type === type && (data(m).subtask as { id?: string } | undefined)?.id === subtaskId;
const evFlat = (type: string, subtaskId: string) => (m: Received["msg"]) =>
  m.type === type && data(m).subtask_id === subtaskId;

// ---------- helpers ----------

async function poll<T>(
  label: string,
  fn: () => Promise<T | null>,
  timeoutMs = TIMEOUT_MS,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v !== null) return v;
    if (Date.now() - start > timeoutMs)
      throw new SmokeError(`timed out after ${timeoutMs}ms: ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function boardTask(taskId: string): Promise<TaskViewT> {
  const state = await call("GET", "/board/state", { schema: BoardState });
  const task = state.tasks.find((t) => t.id === taskId);
  assert(task, `GET /board/state does not contain ${taskId}`);
  return task;
}

function validatedTx(task: TaskViewT, kind: TxKind) {
  return task.transactions.find((t) => t.kind === kind && t.status === "validated");
}

const money = (cents: number) => fromCents(cents);
const wrongPinFor = (pin: string) => String((Number(pin) + 1) % 10_000).padStart(4, "0");

function photoForm(fields: Record<string, string>, name: string): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([PNG_1X1], { type: "image/png" }), name);
  return form;
}

async function createTask(label: string, price: string, minutes: number) {
  const body = {
    description: `Save me a seat at the front table (${label} ${new Date().toISOString()})`,
    place: "Main Stacks, front table",
    time_limit_minutes: minutes,
    price_usd: `$${price}`,
    caller_phone: "+15105550123",
  };
  const res = await call("POST", "/tools/create_task", {
    headers: voiceAuth,
    json: body,
    schema: CreateTaskResponse,
  });
  assert(/^\d{4}$/.test(res.pin), `create_task: PIN is not 4 digits: ${res.pin}`);
  assert(res.status === "open", `create_task: status ${res.status}, expected open`);
  assert(res.price === price, `create_task: price ${res.price}, expected ${price}`);
  return res;
}

/**
 * Like the real local agent: wait for task.new on /ws/agent (and ack it), then make sure the vault's
 * offer exists (offer_id set) before claiming. The server may finish the ledger setup in the background.
 */
async function waitClaimable(agentWs: WsWatch | null, taskId: string) {
  await step("task offered to the agent (task.new, offer_id set)", async () => {
    if (agentWs) {
      try {
        await agentWs.waitFor(
          "task.new",
          (m) => m.type === "task.new" && (m.task as { id?: string })?.id === taskId,
        );
        agentWs.send({ type: "ack", task_id: taskId });
      } catch (e) {
        soft(false, (e as Error).message);
      }
    }
    await poll("GET /agent/tasks/:id has an offer_id", async () => {
      const t = await call("GET", `/agent/tasks/${taskId}`, {
        headers: agentAuth,
        schema: TaskView,
      });
      return t.offer_id ? t : null;
    });
  });
}

// ---------- flows ----------

async function successFlow(board: WsWatch | null, agentWs: WsWatch | null) {
  console.log(
    "\n== Success flow: call -> claim -> sub-task -> helper claim -> photo -> PIN -> payouts ==",
  );
  const price = "5.00";
  const subPrice = "4.00";

  await step("create_task rejects a wrong voice secret (401)", () =>
    callError("POST", "/tools/create_task", 401, "unauthorized", {
      headers: { "x-agent-pledge-secret": "wrong-secret" },
      json: { description: "x", place: "x", time_limit_minutes: 3, price_usd: 5 },
    }),
  );

  const created = await step("POST /tools/create_task (voice secret)", () =>
    createTask("smoke success", price, 3),
  );
  const taskId = created.task_id;
  log(`      task ${taskId}, PIN ${created.pin}, board ${created.board_url}`);
  await boardEvent(board, "task.created", evTask("task.created", taskId));

  await waitClaimable(agentWs, taskId);

  await step("GET /tools/task_status/:id", async () => {
    const s = await call("GET", `/tools/task_status/${taskId}`, {
      headers: voiceAuth,
      schema: TaskStatusResponse,
    });
    assert(s.task_id === taskId, "task_status: wrong task");
  });

  const claimed = await step("POST /agent/tasks/:id/claim (no tx_hash: fake mode)", () =>
    call("POST", `/agent/tasks/${taskId}/claim`, {
      headers: agentAuth,
      json: {},
      schema: ClaimTaskResponse,
    }),
  );
  assert(claimed.task.status === "claimed", `claim: task status ${claimed.task.status}`);
  await boardEvent(board, "task.claimed", evTask("task.claimed", taskId));

  await step("POST /agent/log (decision)", () =>
    call("POST", "/agent/log", {
      headers: agentAuth,
      json: {
        message: `Sub-task price: $${subPrice} (80% of $${price})`,
        task_id: taskId,
        level: "decision",
      },
      schema: AgentLogResponse,
    }),
  );

  const sub = await step("POST /agent/tasks/:id/subtasks", () =>
    call("POST", `/agent/tasks/${taskId}/subtasks`, {
      headers: agentAuth,
      json: { price: subPrice },
      schema: CreateSubtaskResponse,
    }),
  );
  const subId = sub.subtask.id;
  const code = sub.claim_code;
  assert(/^[A-Z2-9]{4}$/.test(code), `sub-task: bad claim code ${code}`);
  assert(
    sub.claim_url.endsWith(`/c/${code}`),
    `sub-task: claim_url ${sub.claim_url} does not end in /c/${code}`,
  );
  assert(sub.subtask.price === subPrice, `sub-task: price ${sub.subtask.price}`);
  log(`      sub-task ${subId}, claim link ${sub.claim_url}`);
  await boardEvent(board, "subtask.created", evSubtask("subtask.created", subId));

  await step("POST /agent/subtasks/:id/screenshot (Yik Yak screenshot)", async () => {
    const res = await call("POST", `/agent/subtasks/${subId}/screenshot`, {
      headers: agentAuth,
      form: photoForm(
        { post_text: `$${subPrice} to save a seat. Claim: ${sub.claim_url}` },
        "yikyak.png",
      ),
      schema: ScreenshotResponse,
    });
    assert(res.subtask.yikyak_screenshot, "screenshot: sub-task has no yikyak_screenshot");
  });
  await boardEvent(board, "yikyak.posted", evFlat("yikyak.posted", subId));

  const before = await step("GET /claim/:code (phone A, before claiming)", async () => {
    const v = await call("GET", `/claim/${code.toLowerCase()}`, { schema: ClaimView });
    assert(
      v.status === "open" && !v.claimed_by_you,
      `claim view: status ${v.status}, claimed_by_you ${v.claimed_by_you}`,
    );
    assert(v.price === subPrice, `claim view: price ${v.price}`);
    assert(v.nft?.holder === "vault", `claim view: NFT holder ${v.nft?.holder}`);
    assert(v.nft.parent_nft_id, "claim view: no parent task NFT");
    assert(v.escrow.amount === subPrice, `claim view: escrow ${v.escrow.amount}`);
    assert(v.escrow.vault_address, "claim view: escrow has no vault address");
    assert(
      v.transactions.some((x) => x.kind === "subtask_nft_mint"),
      "claim view: the sub-task mint is not in transactions",
    );
    assert(v.proof_sha256 === null, "claim view: proof_sha256 before any photo");
    return v;
  });
  const photoPays = before.proof === "photo";
  log(`      proof mode: ${before.proof}`);

  const helper = await step("POST /claim/:code/claim (phone A)", () =>
    call("POST", `/claim/${code}/claim`, { schema: ClaimSubtaskResponse }),
  );
  assert(helper.claim.claimed_by_you, "claim: claimed_by_you is false");
  assert(helper.claim.status === "claimed", `claim: status ${helper.claim.status}`);
  assert(helper.claim.nft?.holder === "you", `claim: NFT holder ${helper.claim.nft?.holder}`);
  const helperAuth = bearer(helper.helper_token);
  await boardEvent(board, "subtask.claimed", evSubtask("subtask.claimed", subId));

  await step("POST /claim/:code/claim (phone B) -> 409 already_claimed", () =>
    callError("POST", `/claim/${code}/claim`, 409, "already_claimed"),
  );

  await step("POST /claim/:code/photo without a helper token -> 401", () =>
    callError("POST", `/claim/${code}/photo`, 401, "unauthorized", {
      form: photoForm({ note: "no token" }, "seat.png"),
    }),
  );

  if (photoPays) {
    await step("POST /claim/:code/pay before the photo -> 409 conflict", () =>
      callError("POST", `/claim/${code}/pay`, 409, "conflict", { headers: helperAuth }),
    );
  }

  const photo = await step(
    `POST /claim/:code/photo (photo + note)${photoPays ? " -> helper paid" : ""}`,
    () =>
      call("POST", `/claim/${code}/photo`, {
        headers: helperAuth,
        form: photoForm({ note: "Front table, left side" }, "seat.png"),
        schema: PhotoResponse,
      }),
  );
  assert(photo.media, "photo: media is null");
  await boardEvent(board, "photo.added", evFlat("photo.added", subId));

  const photoSha256 = await step("GET /media/:id (photo bytes)", async () => {
    const res = await fetch(photo.media!.url);
    assert(res.ok, `GET ${photo.media!.url}: HTTP ${res.status}`);
    assert(
      res.headers.get("content-type")?.startsWith("image/"),
      `media content-type ${res.headers.get("content-type")}`,
    );
    return createHash("sha256")
      .update(Buffer.from(await res.arrayBuffer()))
      .digest("hex");
  });
  assert(
    photo.claim.proof_sha256 === photoSha256,
    `photo: proof_sha256 ${photo.claim.proof_sha256}, the stored bytes hash to ${photoSha256}`,
  );

  let payout: NonNullable<PhotoResponse["payout"]>;
  if (photoPays) {
    assert(photo.payout, "photo: payout is null in photo mode");
    assert(
      photo.payout.amount === subPrice,
      `payout amount ${photo.payout.amount}, expected ${subPrice}`,
    );
    assert(photo.claim.status === "done", `photo: claim status ${photo.claim.status}`);
    payout = photo.payout;
    log(`      helper payout ${payout.amount} tx ${payout.tx_hash}`);
    await boardEvent(board, "subtask.paid", evSubtask("subtask.paid", subId));

    await step("POST /claim/:code/pay -> same payout (idempotent)", async () => {
      const again = await call("POST", `/claim/${code}/pay`, {
        headers: helperAuth,
        schema: PayResponse,
      });
      assert(again.payout.tx_hash === payout.tx_hash, "pay returned a different payout tx");
    });
  } else {
    assert(photo.payout === null, "photo: payout is set in PIN mode");
    await step("POST /claim/:code/pay in PIN mode -> 409 conflict", () =>
      callError("POST", `/claim/${code}/pay`, 409, "conflict", { headers: helperAuth }),
    );
  }

  const wrong = await step("POST /claim/:code/pin (wrong PIN) -> 422 wrong_pin", () =>
    callError("POST", `/claim/${code}/pin`, 422, "wrong_pin", {
      headers: helperAuth,
      json: { pin: wrongPinFor(created.pin) },
    }),
  );
  const details = PinErrorDetails.parse(wrong.details);
  assert(
    details.attempts === 1 && details.attempts_left === 2,
    `wrong PIN details ${JSON.stringify(details)}`,
  );
  await boardEvent(board, "pin.failed", evFlat("pin.failed", subId));

  const paid = await step(
    `POST /claim/:code/pin (correct PIN) -> ${photoPays ? "same payout" : "helper paid"}`,
    () =>
      call("POST", `/claim/${code}/pin`, {
        headers: helperAuth,
        json: { pin: created.pin },
        schema: PinResponse,
      }),
  );
  assert(
    paid.payout.amount === subPrice,
    `payout amount ${paid.payout.amount}, expected ${subPrice}`,
  );
  if (photoPays) {
    assert(paid.payout.tx_hash === payout!.tx_hash, "the PIN returned a different payout tx");
  } else {
    payout = paid.payout;
    log(`      helper payout ${payout.amount} tx ${payout.tx_hash}`);
    await boardEvent(board, "subtask.paid", evSubtask("subtask.paid", subId));
  }

  await step("POST /claim/:code/pin again -> same payout (idempotent)", async () => {
    const again = await call("POST", `/claim/${code}/pin`, {
      headers: helperAuth,
      json: { pin: created.pin },
      schema: PinResponse,
    });
    assert(
      again.payout.tx_hash === paid.payout.tx_hash,
      "repeat PIN returned a different payout tx",
    );
  });

  await step("GET /claim/:code: NFT burned, the payout and the burn in transactions", async () => {
    const v = await call("GET", `/claim/${code}`, { headers: helperAuth, schema: ClaimView });
    assert(v.nft?.holder === "burned", `claim view: NFT holder ${v.nft?.holder}`);
    assert(v.payout?.tx_hash === payout.tx_hash, "claim view: payout differs");
    assert(v.proof_sha256 === photoSha256, "claim view: proof_sha256 differs from the photo");
    const kinds = v.transactions.map((x) => x.kind);
    for (const k of ["subtask_claim", "helper_redeem_offer", "helper_payout", "subtask_nft_burn"]) {
      assert(
        kinds.includes(k as TxKind),
        `claim view: no ${k} in transactions (${kinds.join(", ")})`,
      );
    }
    assert(
      v.transactions.every((x) => x.subtask_id === subId),
      "claim view: a transaction of another sub-task",
    );
  });

  const expectedRedeem = money(toCents(price) + toCents(claimed.task.pledge));
  await step("agent learns the task is redeemable", async () => {
    if (agentWs) {
      try {
        const m = await agentWs.waitFor(
          "task.redeemable",
          (x) => x.type === "task.redeemable" && x.task_id === taskId,
        );
        assert(
          m.amount === expectedRedeem,
          `task.redeemable amount ${String(m.amount)}, expected ${expectedRedeem}`,
        );
        return;
      } catch (e) {
        soft(false, (e as Error).message);
      }
    }
    await poll("GET /agent/tasks/:id shows the sub-task paid", async () => {
      const t = await call("GET", `/agent/tasks/${taskId}`, {
        headers: agentAuth,
        schema: TaskView,
      });
      return t.subtasks.some((s) => s.id === subId && s.paid_at) ? t : null;
    });
  });

  const redeemed = await step("POST /agent/tasks/:id/redeem (no offer_id: fake mode)", () =>
    call("POST", `/agent/tasks/${taskId}/redeem`, {
      headers: agentAuth,
      json: {},
      schema: RedeemTaskResponse,
    }),
  );
  assert(
    redeemed.amount === expectedRedeem,
    `redeem amount ${redeemed.amount}, expected ${expectedRedeem}`,
  );
  log(`      agent payout ${redeemed.amount} tx ${redeemed.payout_tx_hash}`);
  await boardEvent(board, "task.paid", evTask("task.paid", taskId));

  await step("GET /board/state: task done, both payouts validated", async () => {
    const task = await poll("task done with validated payouts", async () => {
      const t = await boardTask(taskId);
      return t.status === "done" &&
        validatedTx(t, "helper_payout") &&
        validatedTx(t, "agent_payout")
        ? t
        : null;
    });
    assert(task.paid_at, "task.paid_at is null");
    assert(task.pin.verified, "task PIN state is not verified");
    const s = task.subtasks.find((x) => x.id === subId);
    assert(s?.status === "done", `sub-task status ${s?.status}`);
    assert(s.photo && s.yikyak_screenshot, "sub-task is missing the photo or the screenshot");
  });

  await step("GET /tasks/:id.json for the task and the sub-task (NFT URI data)", async () => {
    const t = await call("GET", `/tasks/${taskId}.json`, { schema: NftUriData });
    assert(t.kind === "task" && t.status === "done", `task json kind ${t.kind} status ${t.status}`);
    const s = await call("GET", `/tasks/${subId}.json`, { schema: NftUriData });
    assert(
      s.kind === "subtask" && s.parent_task_id === taskId,
      "sub-task json has the wrong parent",
    );
  });

  await step("GET /tools/task_status/:id -> done", async () => {
    const s = await call("GET", `/tools/task_status/${taskId}`, {
      headers: voiceAuth,
      schema: TaskStatusResponse,
    });
    assert(s.status === "done", `task_status ${s.status}`);
  });
}

async function failureFlow(board: WsWatch | null, agentWs: WsWatch | null) {
  console.log("\n== Failure flow: call -> claim -> sub-task -> admin fail -> refunds ==");
  const price = "6.00";
  const subPrice = "4.50"; // 80% of 6.00 rounded down to 0.50 (R9: different numbers from the first run)

  const created = await step("POST /tools/create_task", () =>
    createTask("smoke failure", price, 3),
  );
  const taskId = created.task_id;
  log(`      task ${taskId}`);
  await boardEvent(board, "task.created", evTask("task.created", taskId));
  await waitClaimable(agentWs, taskId);

  const claimed = await step("POST /agent/tasks/:id/claim", () =>
    call("POST", `/agent/tasks/${taskId}/claim`, {
      headers: agentAuth,
      json: {},
      schema: ClaimTaskResponse,
    }),
  );
  const sub = await step("POST /agent/tasks/:id/subtasks", () =>
    call("POST", `/agent/tasks/${taskId}/subtasks`, {
      headers: agentAuth,
      json: { price: subPrice },
      schema: CreateSubtaskResponse,
    }),
  );

  await step("POST /admin/tasks/:id/fail without the agent token -> 401", () =>
    callError("POST", `/admin/tasks/${taskId}/fail`, 401, "unauthorized", { json: {} }),
  );

  await step("POST /admin/tasks/:id/fail", async () => {
    const res = await call("POST", `/admin/tasks/${taskId}/fail`, {
      headers: agentAuth,
      json: { reason: "smoke: no helper in time" },
      schema: AdminFailResponse,
    });
    assert(res.task.status === "failed", `fail: status ${res.task.status}`);
  });
  await boardEvent(board, "task.failed", evTask("task.failed", taskId));

  const refundRequester = money(toCents(price) + toCents(claimed.task.pledge));
  await step(
    `GET /board/state: refunds validated (requester ${refundRequester}, agent ${subPrice})`,
    async () => {
      const task = await poll("refund transactions validated", async () => {
        const t = await boardTask(taskId);
        return t.status === "failed" &&
          validatedTx(t, "refund_requester") &&
          validatedTx(t, "refund_agent")
          ? t
          : null;
      });
      const rr = validatedTx(task, "refund_requester")!;
      const ra = validatedTx(task, "refund_agent")!;
      assert(
        rr.amount === refundRequester,
        `refund_requester amount ${rr.amount}, expected ${refundRequester}`,
      );
      assert(ra.amount === subPrice, `refund_agent amount ${ra.amount}, expected ${subPrice}`);
      soft(task.refunded_at, "task.refunded_at is null after the refunds validated");
      soft(task.fail_reason, "task.fail_reason is null");
      const s = task.subtasks.find((x) => x.id === sub.subtask.id);
      soft(s?.status === "failed", `sub-task status ${s?.status}, expected failed`);
    },
  );

  await step("POST /admin/tasks/:id/fail again (idempotent, no new refunds)", async () => {
    await call("POST", `/admin/tasks/${taskId}/fail`, {
      headers: agentAuth,
      json: {},
      schema: AdminFailResponse,
    });
    const t = await boardTask(taskId);
    const refunds = t.transactions.filter(
      (x) => x.kind === "refund_requester" || x.kind === "refund_agent",
    );
    assert(refunds.length === 2, `expected 2 refund transactions, found ${refunds.length}`);
  });

  await step("POST /claim/:code/claim on the failed sub-task -> 410 expired", () =>
    callError("POST", `/claim/${sub.claim_code}/claim`, 410, "expired"),
  );
}

// ---------- main ----------

async function main() {
  console.log(`Agent Pledge smoke test against ${API} (flows: ${FLOWS.join(", ")})`);

  const health = await step("GET /health", () =>
    call("GET", "/health", { schema: HealthResponse }),
  );
  assert(
    health.ledger_mode === "fake",
    `the server runs LEDGER_MODE=${health.ledger_mode}; this script needs fake (it omits the agent's tx hashes)`,
  );

  let board: WsWatch | null = new WsWatch("board ws", `${WS_BASE}/ws/board`, validateBoard);
  try {
    await step("connect /ws/board and receive the snapshot", async () => {
      await board!.open();
      await board!.waitFor("snapshot", (m) => m.type === "snapshot", 5_000);
    });
  } catch (e) {
    soft(false, (e as Error).message);
    board = null;
  }

  let agentWs: WsWatch | null = null;
  if (USE_AGENT_WS) {
    agentWs = new WsWatch(
      "agent ws",
      `${WS_BASE}/ws/agent?token=${encodeURIComponent(AGENT_TOKEN)}`,
      validateAgent,
    );
    try {
      await step("connect /ws/agent and say hello", async () => {
        await agentWs!.open();
        agentWs!.send({ type: "hello", version: "smoke" });
      });
    } catch (e) {
      soft(false, (e as Error).message);
      agentWs = null;
    }
  }

  try {
    if (FLOWS.includes("success")) await successFlow(board, agentWs);
    if (FLOWS.includes("failure")) await failureFlow(board, agentWs);
  } finally {
    board?.close();
    agentWs?.close();
  }
}

main().then(
  () => {
    console.log(`\nDone in ${Date.now() - t0}ms.`);
    if (softFailures.length) {
      console.log(`${softFailures.length} soft check(s) failed:`);
      for (const f of softFailures) console.log(`  - ${f}`);
      process.exit(1);
    }
    console.log("All checks passed.");
    process.exit(0);
  },
  (err: unknown) => {
    console.error(
      `\nSMOKE FAILED: ${err instanceof SmokeError ? err.message : String((err as Error)?.stack ?? err)}`,
    );
    if (softFailures.length) {
      console.error("Soft checks that failed before that:");
      for (const f of softFailures) console.error(`  - ${f}`);
    }
    process.exit(1);
  },
);
