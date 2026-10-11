import type { AgentServerMessage } from "@agent-pledge/shared";

/** Minimal socket shape (ws.WebSocket satisfies it). */
export interface AgentSocket {
  readyState: number;
  send(data: string): void;
}

/**
 * Registry of connected local-agent sockets. ws/agent.ts (bundle B) attaches sockets; any module
 * sends with `send()` — e.g. tasks service sends task.new, settlement sends task.redeemable.
 * Messages to a disconnected agent are dropped; the reconnect logic in ws/agent.ts resends
 * unacked task.new and pending task.redeemable from the database.
 */
export class AgentChannel {
  private readonly sockets = new Set<AgentSocket>();
  private readonly connectListeners = new Set<(s: AgentSocket) => void>();

  attach(socket: AgentSocket): () => void {
    this.sockets.add(socket);
    for (const l of this.connectListeners) l(socket);
    return () => this.sockets.delete(socket);
  }

  onConnect(listener: (s: AgentSocket) => void): () => void {
    this.connectListeners.add(listener);
    return () => this.connectListeners.delete(listener);
  }

  get connected(): boolean {
    return [...this.sockets].some((s) => s.readyState === 1);
  }

  /** Sends to every open agent socket. Returns how many sockets got it. */
  send(message: AgentServerMessage): number {
    const data = JSON.stringify(message);
    let n = 0;
    for (const s of this.sockets) {
      if (s.readyState === 1) {
        s.send(data);
        n++;
      }
    }
    return n;
  }
}
