import {
  MONEY_REGEX,
  fromCents,
  newId,
  toCents,
  type AgentLedger,
  type AgentTask,
  type TaskRedeemableMessage,
} from "@agent-pledge/shared";
import type { LogInput, ServerApi } from "./api";
import type { PostOutcome, YikYakPoster } from "./yikyak/poster";

/** A tool input the model got wrong. The tool answers with an error result so the model can retry. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** What the agent knows about one task while it works on it. */
export interface TaskContext {
  task: AgentTask;
  claimed: boolean;
  subtask: {
    id: string;
    price: string;
    claim_url: string;
    claim_code: string;
    deadline: string;
  } | null;
  post: PostOutcome | null;
  redeemable: TaskRedeemableMessage | null;
  redeemed: boolean;
}

export interface ToolDeps {
  api: ServerApi;
  /** null in LEDGER_MODE=fake: the server performs the agent's ledger steps. */
  ledger: AgentLedger | null;
  poster: YikYakPoster;
}

/**
 * The five tools from PRD 7.2. Each handler calls the server contract in docs/api.md (and, in xrpl
 * mode, signs the agent's own transaction first). Used by both the LLM runner and the scripted runner,
 * so validation lives here, not in the prompt.
 */
export class AgentTools {
  readonly tasks = new Map<string, TaskContext>();

  constructor(private readonly deps: ToolDeps) {}

  async log(input: LogInput): Promise<void> {
    const line = `[agent] ${input.level ?? "info"}: ${input.message}`;
    console.log(line);
    try {
      await this.deps.api.log(input);
    } catch (err) {
      console.error(`[agent] could not send log to server: ${(err as Error).message}`);
    }
  }

  track(task: AgentTask): TaskContext {
    let ctx = this.tasks.get(task.id);
    if (!ctx) {
      ctx = { task, claimed: false, subtask: null, post: null, redeemable: null, redeemed: false };
      this.tasks.set(task.id, ctx);
    }
    return ctx;
  }

  private ctx(taskId: string): TaskContext {
    const ctx = this.tasks.get(taskId);
    if (!ctx) throw new ToolInputError(`unknown task_id ${taskId}`);
    return ctx;
  }

  /** claim_task: accept the vault's NFT offer and pay the pledge. */
  async claimTask(input: { task_id: string }) {
    const ctx = this.ctx(input.task_id);
    if (ctx.claimed) return { ok: true, already: true, task_id: ctx.task.id, status: "claimed" };
    let txHash: string | undefined;
    if (this.deps.ledger) {
      if (!ctx.task.offer_id)
        throw new ToolInputError("task has no offer_id yet; cannot claim on the ledger");
      const res = await this.deps.ledger.acceptOffer(ctx.task.offer_id, { taskId: ctx.task.id });
      txHash = res.hash;
    }
    const { task } = await this.deps.api.claimTask(ctx.task.id, txHash ? { tx_hash: txHash } : {});
    ctx.claimed = true;
    await this.log({
      level: "decision",
      task_id: task.id,
      message: `Claimed task "${task.description}" at ${task.place}; pledge ${task.pledge} paid`,
    });
    return {
      ok: true,
      task_id: task.id,
      status: task.status,
      price: task.price,
      pledge: task.pledge,
      deadline: task.deadline,
    };
  }

  /** create_subtask: pay the sub-task money into the vault and make the sub-task. */
  async createSubtask(input: { task_id: string; price: string; reason?: string }) {
    const ctx = this.ctx(input.task_id);
    if (!ctx.claimed) throw new ToolInputError("claim the task first (claim_task)");
    if (ctx.subtask) return { ok: true, already: true, ...ctx.subtask };
    const price = validateSubtaskPrice(input.price, ctx.task.price);
    const pct = Math.round((toCents(price) / toCents(ctx.task.price)) * 100);
    await this.log({
      level: "decision",
      task_id: ctx.task.id,
      message: `Sub-task price: ${price} (${pct}% of ${ctx.task.price})${input.reason ? `. ${input.reason}` : ""}`,
    });

    let subtaskId: string | undefined;
    let fundingTx: string | undefined;
    if (this.deps.ledger) {
      subtaskId = newId("sub");
      const res = await this.deps.ledger.fundSubtask(subtaskId, price, {
        taskId: ctx.task.id,
        subtaskId,
      });
      fundingTx = res.hash;
    }
    const res = await this.deps.api.createSubtask(ctx.task.id, {
      price,
      ...(subtaskId ? { subtask_id: subtaskId, funding_tx_hash: fundingTx } : {}),
    });
    ctx.subtask = {
      id: res.subtask.id,
      price: res.subtask.price,
      claim_url: res.claim_url,
      claim_code: res.claim_code,
      deadline: res.subtask.deadline,
    };
    await this.log({
      task_id: ctx.task.id,
      subtask_id: res.subtask.id,
      message: `Created sub-task ${res.subtask.id} for ${res.subtask.price}; claim link ${res.claim_url}`,
    });
    return {
      ok: true,
      subtask_id: res.subtask.id,
      price: res.subtask.price,
      claim_url: res.claim_url,
      claim_code: res.claim_code,
      deadline: res.subtask.deadline,
    };
  }

  /** post_yikyak: give the post to the Yik Yak driver. Returns the screenshot path (or the queue slot). */
  async postYikyak(input: { subtask_id: string; text: string }) {
    const ctx = [...this.tasks.values()].find((c) => c.subtask?.id === input.subtask_id);
    if (!ctx || !ctx.subtask)
      throw new ToolInputError(`unknown subtask_id ${input.subtask_id}; create it first`);
    if (ctx.post) return { ok: true, already: true, ...ctx.post };
    const text = input.text.trim();
    if (!text) throw new ToolInputError("post text is empty");
    if (text.length > 280)
      throw new ToolInputError(`post text is ${text.length} characters; keep it to 280`);
    if (!text.includes(ctx.subtask.claim_url)) {
      throw new ToolInputError(`post text must include the claim link ${ctx.subtask.claim_url}`);
    }
    await this.log({
      level: "decision",
      task_id: ctx.task.id,
      subtask_id: ctx.subtask.id,
      message: `Yik Yak post: "${text}"`,
    });
    const outcome = await this.deps.poster.submit({
      task_id: ctx.task.id,
      subtask_id: ctx.subtask.id,
      text,
      deadline: ctx.subtask.deadline,
    });
    ctx.post = outcome;
    return { ok: true, ...outcome };
  }

  /** get_task: read the status of a task and its sub-tasks. */
  async getTask(input: { task_id: string }) {
    const t = await this.deps.api.getTask(input.task_id);
    return {
      id: t.id,
      status: t.status,
      price: t.price,
      pledge: t.pledge,
      deadline: t.deadline,
      pin: t.pin,
      subtasks: t.subtasks.map((s) => ({
        id: s.id,
        status: s.status,
        price: s.price,
        claim_url: s.claim_url,
        helper_note: s.helper_note,
        paid_at: s.paid_at,
        yikyak_posted_at: s.yikyak_posted_at,
      })),
    };
  }

  /** redeem_task: swap the completed task NFT for the payout (price + pledge). */
  async redeemTask(input: { task_id: string }) {
    const ctx = this.tasks.get(input.task_id);
    if (ctx?.redeemed) return { ok: true, already: true, task_id: input.task_id };
    const info = ctx?.redeemable;
    if (!info)
      throw new ToolInputError("task is not redeemable yet (the helper has not entered the PIN)");
    let body: { offer_id?: string; tx_hash?: string } = {};
    if (this.deps.ledger) {
      if (!info.nft_id)
        throw new ToolInputError("task has no nft_id; cannot create the redeem offer");
      const offer = await this.deps.ledger.createRedeemOffer(info.nft_id, info.amount, {
        taskId: info.task_id,
      });
      body = { offer_id: offer.offerId, tx_hash: offer.hash };
    }
    const res = await this.deps.api.redeemTask(info.task_id, body);
    if (ctx) ctx.redeemed = true;
    await this.log({
      level: "decision",
      task_id: info.task_id,
      message: `Redeemed the task NFT for ${res.amount} (price + pledge); payout ${res.explorer_url}`,
    });
    return {
      ok: true,
      task_id: info.task_id,
      amount: res.amount,
      payout_tx_hash: res.payout_tx_hash,
      explorer_url: res.explorer_url,
    };
  }

  /** Remembers a task.redeemable message (also for tasks from before a restart). */
  markRedeemable(msg: TaskRedeemableMessage): TaskContext {
    let ctx = this.tasks.get(msg.task_id);
    if (!ctx) {
      // Task from before a restart: we only need the message fields to redeem.
      ctx = {
        task: { id: msg.task_id } as AgentTask,
        claimed: true,
        subtask: null,
        post: null,
        redeemable: msg,
        redeemed: false,
      };
      this.tasks.set(msg.task_id, ctx);
    }
    ctx.redeemable = msg;
    return ctx;
  }
}

/**
 * The only hard rule on the price (the policy itself is in the system prompt): a valid amount,
 * more than 0, and not more than the task price. Returns the normalized Money string.
 */
export function validateSubtaskPrice(input: unknown, taskPrice: string): string {
  const raw =
    typeof input === "number"
      ? input.toFixed(2)
      : String(input ?? "")
          .trim()
          .replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new ToolInputError(`price "${String(input)}" is not an amount like "4.00"`);
  const cents = toCents(raw);
  const price = fromCents(cents);
  if (!MONEY_REGEX.test(price))
    throw new ToolInputError(`price "${String(input)}" is out of range`);
  if (cents <= 0) throw new ToolInputError("price must be more than 0.00");
  if (cents > toCents(taskPrice))
    throw new ToolInputError(`price ${price} is more than the task price ${taskPrice}`);
  return price;
}
