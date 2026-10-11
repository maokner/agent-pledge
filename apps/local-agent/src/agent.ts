import path from "node:path";
import type {
  AgentLedger,
  AgentServerMessage,
  AgentTask,
  TaskRedeemableMessage,
} from "@agent-pledge/shared";
import { ServerApi } from "./api";
import type { AgentConfig } from "./config";
import { createLedger } from "./ledger";
import { newTaskPrompt, redeemPrompt, runAgent } from "./llm";
import { runScripted } from "./scripted";
import { AgentSocket } from "./socket";
import { AgentTools } from "./tools";
import { createDriver, type YikYakDriver } from "./yikyak/drivers";
import { YikYakPoster } from "./yikyak/poster";

export const AGENT_VERSION = "0.1.0";

export interface AgentOverrides {
  driver?: YikYakDriver;
  ledger?: AgentLedger | null;
  now?: () => number;
  minBackoffMs?: number;
}

/** Ties the socket, the tools, the poster, and the runner (llm or scripted) together. One task at a time. */
export class LocalAgent {
  readonly tools: AgentTools;
  private readonly socket: AgentSocket;
  private chain: Promise<void> = Promise.resolve();
  private readonly seenTasks = new Set<string>();
  private readonly redeemsInFlight = new Set<string>();

  private constructor(
    readonly config: AgentConfig,
    readonly api: ServerApi,
    readonly ledger: AgentLedger | null,
    readonly poster: YikYakPoster,
    overrides: AgentOverrides,
  ) {
    this.tools = new AgentTools({ api, ledger, poster });
    this.socket = new AgentSocket({
      url: config.wsUrl,
      token: config.agentToken,
      agentAddress: ledger?.address,
      version: AGENT_VERSION,
      minBackoffMs: overrides.minBackoffMs,
      onMessage: (m) => this.onMessage(m),
      onStatus: (s, d) => console.log(`[ws] ${s}${d ? ` (${d})` : ""} ${config.wsUrl}`),
    });
  }

  static async create(config: AgentConfig, overrides: AgentOverrides = {}): Promise<LocalAgent> {
    const api = new ServerApi(config.serverUrl, config.agentToken);
    const ledger = overrides.ledger !== undefined ? overrides.ledger : await createLedger(config);
    const driver = overrides.driver ?? createDriver(config.yikyak, config.stateDir);
    let agentRef: LocalAgent | null = null;
    const poster = await YikYakPoster.open({
      driver,
      stateFile: path.join(config.stateDir, "yikyak-state.json"),
      minIntervalMs: config.yikyak.minIntervalMs,
      now: overrides.now,
      log: (input) => agentRef!.tools.log(input),
      onPosted: async (job, file, postedAt) => {
        try {
          const res = await api.uploadScreenshot(job.subtask_id, file, job.text, postedAt);
          await agentRef!.tools.log({
            task_id: job.task_id,
            subtask_id: job.subtask_id,
            message: `Uploaded the Yik Yak screenshot to the board`,
          });
          return res.media.url;
        } catch (err) {
          await agentRef!.tools.log({
            level: "error",
            task_id: job.task_id,
            subtask_id: job.subtask_id,
            message: `Screenshot upload failed: ${(err as Error).message} (file kept at ${file})`,
          });
          return null;
        }
      },
    });
    const agent = new LocalAgent(config, api, ledger, poster, overrides);
    agentRef = agent;
    return agent;
  }

  start(): void {
    console.log(
      `[agent] mode=${this.config.agentMode} ledger=${this.config.ledgerMode} model=${this.config.model} ` +
        `yikyak=${this.config.yikyak.driver} state=${this.config.stateDir}`,
    );
    this.socket.start();
  }

  async stop(): Promise<void> {
    this.socket.stop();
    await this.chain;
    await this.poster.close();
    await this.ledger?.close?.();
  }

  /** Resolves when every queued job has finished. For tests and shutdown. */
  idle(): Promise<void> {
    return this.chain;
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  private enqueue(job: () => Promise<void>): void {
    this.chain = this.chain
      .then(job)
      .catch((err) => console.error(`[agent] job failed: ${(err as Error).message}`));
  }

  private onMessage(msg: AgentServerMessage): void {
    if (msg.type === "task.new") {
      this.socket.send({ type: "ack", task_id: msg.task.id });
      if (this.seenTasks.has(msg.task.id)) return;
      this.seenTasks.add(msg.task.id);
      this.enqueue(() => this.handleTask(msg.task));
    } else if (msg.type === "task.redeemable") {
      const ctx = this.tools.tasks.get(msg.task_id);
      if (ctx?.redeemed || this.redeemsInFlight.has(msg.task_id)) return;
      this.redeemsInFlight.add(msg.task_id);
      this.enqueue(() =>
        this.handleRedeemable(msg).finally(() => this.redeemsInFlight.delete(msg.task_id)),
      );
    }
  }

  async handleTask(task: AgentTask): Promise<void> {
    const started = Date.now();
    const ctx = this.tools.track(task);
    await this.tools.log({
      task_id: task.id,
      message: `New task: "${task.description}" at ${task.place}, ${task.price} in ${task.time_limit_minutes} min (${this.config.agentMode} mode)`,
    });
    try {
      if (this.config.agentMode === "llm") {
        try {
          await runAgent(this.config, this.tools, newTaskPrompt(ctx), task.id);
        } catch (err) {
          await this.tools.log({
            level: "error",
            task_id: task.id,
            message: `LLM run failed: ${(err as Error).message}`,
          });
        }
        if (!ctx.claimed || !ctx.subtask || !ctx.post) {
          await this.tools.log({
            level: "error",
            task_id: task.id,
            message: "LLM did not finish every step; finishing with the scripted steps",
          });
          await runScripted(this.tools, ctx);
        }
      } else {
        await runScripted(this.tools, ctx);
      }
      console.log(
        `[agent] task ${task.id} handled in ${((Date.now() - started) / 1000).toFixed(1)} s`,
      );
    } catch (err) {
      await this.tools.log({
        level: "error",
        task_id: task.id,
        message: `Could not handle the task: ${(err as Error).message}`,
      });
    }
  }

  async handleRedeemable(msg: TaskRedeemableMessage): Promise<void> {
    const ctx = this.tools.markRedeemable(msg);
    await this.tools.log({
      task_id: msg.task_id,
      subtask_id: msg.subtask_id,
      message: `Helper entered the correct PIN; redeeming the task NFT for ${msg.amount}`,
    });
    try {
      if (this.config.agentMode === "llm") {
        try {
          await runAgent(
            this.config,
            this.tools,
            redeemPrompt(msg.task_id, msg.amount),
            msg.task_id,
          );
        } catch (err) {
          await this.tools.log({
            level: "error",
            task_id: msg.task_id,
            message: `LLM redeem run failed: ${(err as Error).message}`,
          });
        }
      }
      if (!ctx.redeemed) await this.tools.redeemTask({ task_id: msg.task_id });
    } catch (err) {
      await this.tools.log({
        level: "error",
        task_id: msg.task_id,
        message: `Redeem failed: ${(err as Error).message}`,
      });
    }
  }
}
