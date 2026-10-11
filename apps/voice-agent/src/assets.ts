/** Reads the prompt, the first message, and the tool templates from the package directory. */
import { readFileSync } from "node:fs";
import { packagePath } from "./paths.js";

export const TOOL_NAMES = ["create_task", "task_status"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface AgentAssets {
  systemPrompt: string;
  firstMessage: string;
  toolTemplates: Record<ToolName, unknown>;
}

export function readText(...parts: string[]): string {
  return readFileSync(packagePath(...parts), "utf8");
}

export function loadAssets(): AgentAssets {
  return {
    systemPrompt: readText("prompt", "system-prompt.md").trim(),
    firstMessage: readText("prompt", "first-message.txt").trim(),
    toolTemplates: {
      create_task: JSON.parse(readText("tools", "create_task.json")) as unknown,
      task_status: JSON.parse(readText("tools", "task_status.json")) as unknown,
    },
  };
}
