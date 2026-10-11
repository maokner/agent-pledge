import {
  createSdkMcpServer,
  query,
  tool,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AgentConfig } from "./config";
import { ToolInputError, type AgentTools, type TaskContext } from "./tools";

export const MCP_SERVER_NAME = "agent_pledge";
export const TOOL_NAMES = [
  "claim_task",
  "create_subtask",
  "post_yikyak",
  "get_task",
  "redeem_task",
] as const;
const ALLOWED_TOOLS = TOOL_NAMES.map((n) => `mcp__${MCP_SERVER_NAME}__${n}`);

/** The agent's instructions. The price policy lives here, not in code (R9). */
export const SYSTEM_PROMPT = `You are the Agent Pledge local agent. You run on our laptop with nobody at the keyboard.
A person called our voice line and asked for a seat to be held. You take the task, pay a pledge, and hire a
nearby student through a Yik Yak post to do it. Act at once: the helper needs every second of the time limit.

For each new task, do these steps in order, using only your tools:
1. claim_task with the task_id. This accepts the NFT offer and pays the pledge.
2. Decide the sub-task price. Policy for this demo: 80% of the task price, rounded DOWN to the nearest 0.50.
   Example: task price 5.00 -> 80% is 4.00 -> sub-task price 4.00. Task price 7.00 -> 5.60 -> 5.50.
   Call create_subtask with the price as a string like "4.00" and a short reason that shows the math.
3. Write one short Yik Yak post (under 200 characters, plain text, no hashtags, at most one emoji) from the task
   data: what to do, the place, the time limit, the sub-task price (what the helper earns, e.g. "$4"), and the
   exact claim_url that create_subtask returned. Make it sound like a student wrote it. Example shape:
   "$4 to save a seat at the front table in Main Stacks in the next 3 min. First to claim gets it: <claim_url>"
4. post_yikyak with the subtask_id and the text. A "queued" result is fine (rate limit); do not retry.
Then stop and reply with one line summarizing what you did.

When told that a task is redeemable (the helper entered the correct PIN), call redeem_task with the task_id.

If a tool returns an error, read it, fix your input, and try again once. Never invent IDs or links.`;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn()) }] };
  } catch (err) {
    const msg = err instanceof ToolInputError ? err.message : `failed: ${(err as Error).message}`;
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

/** The five PRD 7.2 tools as Agent SDK tool definitions. Exported so tests can call the handlers directly. */
export function buildToolDefinitions(tools: AgentTools) {
  return [
    tool(
      "claim_task",
      "Claim a task: accept the vault's NFT offer for it and pay the pledge.",
      { task_id: z.string().describe("The task ID, e.g. task_k3j9x0c2m1q8z7w4") },
      (a) => run(() => tools.claimTask(a)),
    ),
    tool(
      "create_subtask",
      "Pay the sub-task money into the vault and create the sub-task. Returns subtask_id and the claim_url for the post.",
      {
        task_id: z.string(),
        price: z
          .string()
          .describe(
            'What the helper earns, a decimal string like "4.00". Must be > 0 and <= the task price.',
          ),
        reason: z.string().describe("One short sentence explaining the price, with the math."),
      },
      (a) => run(() => tools.createSubtask(a)),
    ),
    tool(
      "post_yikyak",
      "Post the text on Yik Yak from our logged-in account. Returns the screenshot path, or a queue slot when rate limited.",
      {
        subtask_id: z.string(),
        text: z
          .string()
          .describe("The post. Must contain the exact claim_url from create_subtask."),
      },
      (a) => run(() => tools.postYikyak(a)),
    ),
    tool("get_task", "Read the status of a task and its sub-tasks.", { task_id: z.string() }, (a) =>
      run(() => tools.getTask(a)),
    ),
    tool(
      "redeem_task",
      "Swap the completed task NFT for the payout (price + pledge). Only after the task is redeemable.",
      { task_id: z.string() },
      (a) => run(() => tools.redeemTask(a)),
    ),
  ];
}

async function* single(text: string): AsyncGenerator<SDKUserMessage> {
  yield { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
}

/** Runs one Agent SDK conversation with only our five tools. */
export async function runAgent(
  config: AgentConfig,
  tools: AgentTools,
  prompt: string,
  taskId: string,
): Promise<void> {
  const server = createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: "0.1.0",
    tools: buildToolDefinitions(tools),
  });
  const q = query({
    prompt: single(prompt),
    options: {
      model: config.model,
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { [MCP_SERVER_NAME]: server },
      tools: [],
      allowedTools: ALLOWED_TOOLS,
      permissionMode: "dontAsk",
      settingSources: [],
      persistSession: false,
      maxTurns: 12,
      effort: "low",
      env: { ...process.env, ANTHROPIC_API_KEY: config.anthropicApiKey },
    },
  });
  for await (const msg of q) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) console.log(`[llm] ${block.text.trim()}`);
        if (block.type === "tool_use")
          console.log(`[llm] -> ${block.name} ${JSON.stringify(block.input)}`);
      }
    } else if (msg.type === "result") {
      if (msg.subtype === "success") {
        if (msg.result)
          await tools.log({ task_id: taskId, message: `Agent: ${msg.result.slice(0, 500)}` });
      } else {
        throw new Error(`agent run ended with ${msg.subtype}`);
      }
    }
  }
}

export function newTaskPrompt(ctx: TaskContext): string {
  return `New task from the server:\n${JSON.stringify(ctx.task, null, 2)}\nHandle it now.`;
}

export function redeemPrompt(taskId: string, amount: string): string {
  return `Task ${taskId} is redeemable: the helper entered the correct PIN and was paid. Redeem it now (amount ${amount}).`;
}
