/**
 * Fake local agent (LEDGER_MODE=fake). Connects to /ws/agent, claims every task.new, creates a
 * sub-task at 80% of the price rounded down to $0.50, logs its decisions to the board, and redeems
 * the task on task.redeemable. It omits tx hashes, so the server performs the agent's ledger steps
 * with the FakeLedger's agent account.
 *
 *   API_URL=http://localhost:3001 AGENT_TOKEN=... pnpm --filter @agent-pledge/server exec tsx scripts/fake-agent.ts
 */
import { pathToFileURL } from "node:url";
import {
  AgentServerMessage,
  fromCents,
  subtaskPriceCents,
  toCents,
  type AgentTask,
  type CreateSubtaskResponse,
  type TaskRedeemableMessage,
} from "@agent-pledge/shared";
import WebSocket from "ws";

export interface FakeAgentOptions {
  apiUrl: string;
  token: string;
  /** Where to print what it does (default console.log). */
  print?: (line: string) => void;
  reconnectMs?: number;
}

export interface FakeAgent {
  stop(): Promise<void>;
  /** Resolves when every message received so far has been handled. */
  idle(): Promise<void>;
}

export function startFakeAgent(opts: FakeAgentOptions): FakeAgent {
  const api = opts.apiUrl.replace(/\/+$/, "");
  const print = opts.print ?? ((l: string) => console.log(`[fake-agent] ${l}`));
  const headers = { authorization: `Bearer ${opts.token}`, "content-type": "application/json" };
  const handled = new Set<string>();
  let chain: Promise<void> = Promise.resolve();
  let stopped = false;
  let ws: WebSocket | null = null;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${api}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error} ${json.message}`);
    return json;
  }

  const log = (message: string, level: "info" | "decision" | "error", taskId?: string) =>
    call("POST", "/agent/log", { message, level, task_id: taskId ?? null }).catch((e) =>
      print(`log failed: ${(e as Error).message}`),
    );

  async function onTask(task: AgentTask) {
    ws?.send(JSON.stringify({ type: "ack", task_id: task.id }));
    if (handled.has(`new:${task.id}`)) return;
    handled.add(`new:${task.id}`);
    print(`task.new ${task.id}: ${task.description} ($${task.price})`);
    await log(`New task: ${task.description} at ${task.place} for $${task.price}`, "info", task.id);
    try {
      await call("POST", `/agent/tasks/${task.id}/claim`, {});
    } catch (e) {
      print(`claim failed: ${(e as Error).message}`);
      return;
    }
    await log(`Claimed the task and paid a $${task.pledge} pledge`, "decision", task.id);
    const price = fromCents(subtaskPriceCents(toCents(task.price)));
    await log(
      `Sub-task price: $${price} (80% of $${task.price}, rounded down to $0.50)`,
      "decision",
      task.id,
    );
    const sub = await call<CreateSubtaskResponse>("POST", `/agent/tasks/${task.id}/subtasks`, {
      price,
    });
    print(`sub-task ${sub.subtask.id} at $${price}: ${sub.claim_url}`);
    await log(`Posted the $${price} sub-task: ${sub.claim_url}`, "info", task.id);
  }

  async function onRedeemable(m: TaskRedeemableMessage) {
    if (handled.has(`redeem:${m.task_id}`)) return;
    handled.add(`redeem:${m.task_id}`);
    print(`task.redeemable ${m.task_id}: $${m.amount}`);
    try {
      const r = await call<{ amount: string }>("POST", `/agent/tasks/${m.task_id}/redeem`, {});
      await log(`Redeemed the task NFT for $${r.amount}`, "decision", m.task_id);
    } catch (e) {
      handled.delete(`redeem:${m.task_id}`);
      print(`redeem failed: ${(e as Error).message}`);
    }
  }

  function connect() {
    const url = `${api.replace(/^http/, "ws")}/ws/agent`;
    const sock = new WebSocket(url, { headers: { authorization: headers.authorization } });
    ws = sock;
    sock.on("open", () => {
      print(`connected to ${url}`);
      sock.send(JSON.stringify({ type: "hello", version: "fake-agent" }));
    });
    sock.on("message", (raw) => {
      const parsed = AgentServerMessage.safeParse(JSON.parse(String(raw)));
      if (!parsed.success) return;
      const m = parsed.data;
      chain = chain
        .then(() => (m.type === "task.new" ? onTask(m.task) : onRedeemable(m)))
        .catch((e) => print(`error: ${(e as Error).message}`));
    });
    sock.on("error", (e) => print(`socket error: ${e.message}`));
    sock.on("close", () => {
      if (stopped) return;
      print("disconnected; reconnecting");
      setTimeout(() => !stopped && connect(), opts.reconnectMs ?? 1000);
    });
  }

  connect();
  return {
    idle: () => chain,
    async stop() {
      stopped = true;
      await chain;
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        const s = ws;
        await new Promise<void>((r) => {
          s.once("close", () => r());
          s.close();
        });
      }
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const agent = startFakeAgent({
    apiUrl: process.env.API_URL ?? process.env.PUBLIC_API_URL ?? "http://localhost:3001",
    token: process.env.AGENT_TOKEN ?? "dev-only-change-me-0123456789abcdef",
  });
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.once(sig, () => void agent.stop().then(() => process.exit(0)));
}
