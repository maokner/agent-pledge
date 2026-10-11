import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import type WebSocket from "ws";
import type { AgentServerMessage, AgentTask } from "@agent-pledge/shared";
import type { YikYakDriver } from "../src/yikyak/drivers";

export const TOKEN = "test-agent-token";

/** A 1x1 transparent PNG. */
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** A Yik Yak driver that never touches the network: it writes a PNG and records the text. */
export class FakeDriver implements YikYakDriver {
  readonly name = "fake";
  readonly posts: string[] = [];
  constructor(
    private readonly dir: string,
    readonly real = true,
  ) {}
  async post(text: string): Promise<string> {
    this.posts.push(text);
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, `fake-${this.posts.length}.png`);
    await writeFile(file, PNG_1X1);
    return file;
  }
}

export function makeTask(over: Partial<AgentTask> = {}): AgentTask {
  const now = Date.now();
  return {
    id: `task_${Math.random().toString(36).slice(2, 10).padEnd(16, "x")}`,
    description: "Save me a seat at the front table",
    place: "Main Stacks",
    time_limit_minutes: 3,
    deadline: new Date(now + 3 * 60_000).toISOString(),
    price: "5.00",
    pledge: "1.00",
    status: "open",
    nft_id: "NFT1",
    offer_id: "OFFER1",
    vault_address: "rVault",
    board_url: "http://board.test",
    created_at: new Date(now).toISOString(),
    ...over,
  };
}

interface Recorded {
  hellos: unknown[];
  acks: string[];
  claims: { id: string; body: unknown }[];
  subtasks: { id: string; body: { price: string } }[];
  redeems: { id: string; body: unknown }[];
  screenshots: { id: string; post_text: string; posted_at: string; bytes: number }[];
  logs: { message: string; level?: string; task_id?: string }[];
}

/** A small Fastify app implementing the agent endpoints from docs/api.md 3.2 and /ws/agent. */
export class MockServer {
  readonly app: FastifyInstance = Fastify();
  readonly rec: Recorded = {
    hellos: [],
    acks: [],
    claims: [],
    subtasks: [],
    redeems: [],
    screenshots: [],
    logs: [],
  };
  readonly tasks = new Map<string, AgentTask>();
  private readonly sockets = new Set<WebSocket>();
  private subCount = 0;
  url = "";

  async start(): Promise<this> {
    const app = this.app;
    await app.register(multipart);
    await app.register(websocket);
    const auth = async (req: FastifyRequest, reply: FastifyReply) => {
      const q = (req.query as { token?: string }).token;
      if (req.headers.authorization !== `Bearer ${TOKEN}` && q !== TOKEN) {
        return reply.code(401).send({ error: "unauthorized", message: "bad token" });
      }
    };
    app.addHook("preHandler", async (req, reply) => {
      if (req.url.startsWith("/agent/")) return auth(req, reply);
    });

    const view = (t: AgentTask, status: string) => ({
      ...t,
      status,
      subtasks: [],
      transactions: [],
    });

    app.post<{ Params: { id: string } }>("/agent/tasks/:id/claim", async (req, reply) => {
      const t = this.tasks.get(req.params.id);
      if (!t) return reply.code(404).send({ error: "not_found", message: "no task" });
      this.rec.claims.push({ id: t.id, body: req.body });
      return { task: view(t, "claimed") };
    });
    app.post<{ Params: { id: string }; Body: { price: string } }>(
      "/agent/tasks/:id/subtasks",
      async (req) => {
        this.rec.subtasks.push({ id: req.params.id, body: req.body });
        this.subCount += 1;
        const id = `sub_${String(this.subCount).padStart(16, "0")}`;
        const code = `C${String(this.subCount).padStart(3, "2")}`;
        const t = this.tasks.get(req.params.id)!;
        return {
          subtask: {
            id,
            task_id: t.id,
            price: req.body.price,
            deadline: t.deadline,
            status: "open",
            claim_code: code,
          },
          claim_url: `http://board.test/c/${code}`,
          claim_code: code,
        };
      },
    );
    app.get<{ Params: { id: string } }>("/agent/tasks/:id", async (req) => {
      const t = this.tasks.get(req.params.id)!;
      return {
        ...view(t, "claimed"),
        pin: { attempts: 0, attempts_left: 3, locked: false, verified: false },
      };
    });
    app.post<{ Params: { id: string } }>("/agent/tasks/:id/redeem", async (req) => {
      this.rec.redeems.push({ id: req.params.id, body: req.body });
      const t = this.tasks.get(req.params.id);
      return {
        task: t ? view(t, "done") : null,
        amount: "6.00",
        payout_tx_hash: "ABC",
        explorer_url: "https://x/ABC",
      };
    });
    app.post<{ Params: { id: string } }>("/agent/subtasks/:id/screenshot", async (req) => {
      const fields: Record<string, string> = {};
      let bytes = 0;
      for await (const part of req.parts()) {
        if (part.type === "file") bytes = (await part.toBuffer()).length;
        else fields[part.fieldname] = String(part.value);
      }
      this.rec.screenshots.push({
        id: req.params.id,
        post_text: fields.post_text ?? "",
        posted_at: fields.posted_at ?? "",
        bytes,
      });
      return {
        media: { id: "med_1", url: "http://api.test/media/med_1" },
        subtask: { id: req.params.id },
      };
    });
    app.post<{ Body: { message: string; level?: string; task_id?: string } }>(
      "/agent/log",
      async (req) => {
        this.rec.logs.push(req.body);
        return { entry: { id: this.rec.logs.length, ...req.body } };
      },
    );

    app.register(async (scope) => {
      scope.get("/ws/agent", { websocket: true, preValidation: auth }, (socket) => {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
        socket.on("message", (data) => {
          const msg = JSON.parse(data.toString()) as { type: string; task_id?: string };
          if (msg.type === "hello") this.rec.hellos.push(msg);
          if (msg.type === "ack" && msg.task_id) this.rec.acks.push(msg.task_id);
        });
        // Like the real server: resend un-acked tasks on every connect.
        for (const t of this.tasks.values()) {
          if (!this.rec.acks.includes(t.id))
            socket.send(JSON.stringify({ type: "task.new", task: t }));
        }
      });
    });

    this.url = await app.listen({ port: 0, host: "127.0.0.1" });
    return this;
  }

  get wsUrl(): string {
    return `${this.url.replace("http", "ws")}/ws/agent`;
  }

  get connections(): number {
    return this.sockets.size;
  }

  pushTask(task: AgentTask): void {
    this.tasks.set(task.id, task);
    this.broadcast({ type: "task.new", task });
  }

  broadcast(msg: AgentServerMessage): void {
    for (const s of this.sockets) s.send(JSON.stringify(msg));
  }

  /** Simulates a network drop. */
  dropAll(): void {
    for (const s of this.sockets) s.terminate();
  }

  async stop(): Promise<void> {
    this.dropAll();
    await this.app.close();
  }
}

export async function waitFor(
  fn: () => boolean,
  timeoutMs = 5000,
  label = "condition",
): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
