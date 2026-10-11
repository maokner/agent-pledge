import WebSocket from "ws";
import { AgentServerMessage, type AgentClientMessage } from "@agent-pledge/shared";

export interface AgentSocketOptions {
  url: string;
  token: string;
  /** Sent in the hello message. */
  agentAddress?: string;
  version?: string;
  onMessage: (msg: AgentServerMessage) => void;
  onStatus?: (status: "open" | "closed", detail?: string) => void;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

/**
 * Outbound WebSocket to /ws/agent (docs/api.md section 5): bearer token on the upgrade (and ?token=),
 * hello right after connecting, reconnect with exponential backoff after any drop.
 */
export class AgentSocket {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: AgentSocketOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  private connect(): void {
    const url = new URL(this.opts.url);
    url.searchParams.set("token", this.opts.token);
    const ws = new WebSocket(url, { headers: { authorization: `Bearer ${this.opts.token}` } });
    this.ws = ws;
    ws.on("open", () => {
      this.attempt = 0;
      this.send({
        type: "hello",
        agent_address: this.opts.agentAddress,
        version: this.opts.version,
      });
      this.opts.onStatus?.("open");
    });
    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        console.error("[ws] ignored a message that is not JSON");
        return;
      }
      const res = AgentServerMessage.safeParse(parsed);
      if (!res.success) {
        console.error(`[ws] ignored an unknown message: ${data.toString().slice(0, 200)}`);
        return;
      }
      this.opts.onMessage(res.data);
    });
    ws.on("error", (err) => {
      console.error(`[ws] error: ${err.message}`);
    });
    ws.on("close", (code) => {
      if (this.ws === ws) this.ws = null;
      this.opts.onStatus?.("closed", String(code));
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;
    const min = this.opts.minBackoffMs ?? 500;
    const max = this.opts.maxBackoffMs ?? 10_000;
    const delay = Math.min(max, min * 2 ** this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this.connect();
    }, delay);
  }

  send(msg: AgentClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
  }
}
