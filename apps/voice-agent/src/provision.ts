/**
 * Creates or updates the ElevenLabs agent, its two server tools, the tool secret, and the phone number link.
 * The steps talk to a ProvisionApi, so the same code runs against the real API, the dry run, and test fakes.
 *
 * Order: check the server, then do every read, then write.
 * Thus a wrong PUBLIC_BASE_URL, a wrong VOICE_TOOL_SECRET, or a stale ELEVENLABS_AGENT_ID fails before anything changes.
 */
import { TOOL_NAMES, type AgentAssets, type ToolName } from "./assets.js";
import type { ProvisionConfig } from "./config.js";
import {
  SECRET_NAME,
  buildAgentCreatePayload,
  buildAgentUpdatePayload,
  buildPhoneNumberUpdatePayload,
  buildSecretCreatePayload,
  buildSecretUpdatePayload,
  buildToolPayload,
} from "./payloads.js";
import type {
  AgentCreateWire,
  AgentUpdateWire,
  PhoneNumberUpdateWire,
  SecretCreateWire,
  SecretUpdateWire,
  ToolWire,
} from "./sdk-payloads.js";
import type { CheckResult, ServerCheck } from "./simulate.js";

/** The ElevenLabs operations that provisioning needs. Bodies are in the exact wire format. */
export interface ProvisionApi {
  /** Returns the id of the workspace secret with this exact name, or null. */
  findSecretId(name: string): Promise<string | null>;
  createSecret(body: SecretCreateWire): Promise<string>;
  updateSecret(secretId: string, body: SecretUpdateWire): Promise<void>;
  /** Returns the ids of agents with this exact name. */
  findAgentIdsByName(name: string): Promise<string[]>;
  /** Returns the tool ids attached to the agent, by tool name, or null if the agent does not exist. */
  getAgentTools(agentId: string): Promise<Map<string, string> | null>;
  /** Returns the ids of webhook tools with this exact name that no agent uses, for example from a failed run. */
  findUnusedToolIds(name: string): Promise<string[]>;
  createTool(body: ToolWire): Promise<string>;
  updateTool(toolId: string, body: ToolWire): Promise<void>;
  createAgent(body: AgentCreateWire): Promise<string>;
  updateAgent(agentId: string, body: AgentUpdateWire): Promise<void>;
  updatePhoneNumber(phoneNumberId: string, body: PhoneNumberUpdateWire): Promise<void>;
}

export interface ProvisionOptions {
  log?: (line: string) => void;
  /** Checks the server at PUBLIC_BASE_URL. Not called with --skip-server-check. */
  checkServer: ServerCheck;
}

export interface ProvisionResult {
  secretId: string;
  /** False when an existing secret was kept without --rotate-secret. */
  secretWritten: boolean;
  toolIds: Record<ToolName, string>;
  agentId: string;
  agentCreated: boolean;
  phoneNumberId: string | null;
}

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionError";
  }
}

export const ROTATE_WARNING =
  `WARNING: --rotate-secret replaces the value of the workspace secret ${SECRET_NAME}. ` +
  "Every agent in this ElevenLabs workspace uses it, so from now on all of them send this VOICE_TOOL_SECRET, " +
  "and every server behind them must expect it.";

export const KEEP_SECRET_NOTE =
  "ElevenLabs does not show a secret's value, so it must already equal VOICE_TOOL_SECRET. " +
  "If tool calls get 401, pass --rotate-secret to replace it (this affects every agent in the workspace).";

function formatFailures(results: CheckResult[]): string {
  return results
    .filter((r) => !r.ok)
    .map((r) => `  - ${r.name}: ${r.detail}`)
    .join("\n");
}

export async function provision(
  config: ProvisionConfig,
  assets: AgentAssets,
  api: ProvisionApi,
  options: ProvisionOptions,
): Promise<ProvisionResult> {
  const log = options.log ?? (() => {});

  // 1. The server must answer and accept VOICE_TOOL_SECRET, or every call fails after the change.
  if (config.skipServerCheck) {
    log("Server check: skipped (--skip-server-check)");
  } else {
    log(`Server check: ${config.publicBaseUrl}`);
    const results = await options.checkServer(config.publicBaseUrl, config.voiceToolSecret);
    for (const r of results) log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    if (results.some((r) => !r.ok)) {
      throw new ProvisionError(
        `The server at PUBLIC_BASE_URL failed the check, so nothing was changed:\n${formatFailures(results)}\n` +
          "Fix the server, PUBLIC_BASE_URL, or VOICE_TOOL_SECRET, or pass --skip-server-check.",
      );
    }
  }

  // 2. Reads. Nothing is written until all of them succeed.
  // Refuse to make a second agent by accident. ELEVENLABS_AGENT_ID is the idempotency key.
  if (!config.agentId && !config.createNew) {
    const existing = await api.findAgentIdsByName(config.agentName);
    if (existing.length > 0) {
      throw new ProvisionError(
        `An agent named "${config.agentName}" already exists: ${existing.join(", ")}. ` +
          "Set ELEVENLABS_AGENT_ID to update it, or pass --create-new to make another one.",
      );
    }
  }

  let attached = new Map<string, string>();
  if (config.agentId) {
    const tools = await api.getAgentTools(config.agentId);
    if (!tools) {
      throw new ProvisionError(
        `ELEVENLABS_AGENT_ID is ${config.agentId}, but this workspace has no agent with that id, so nothing was changed. ` +
          "Unset ELEVENLABS_AGENT_ID to create a new agent (add --create-new if an agent with the same name exists), " +
          "or set it to the id of an existing agent.",
      );
    }
    attached = tools;
  }

  const existingToolIds = {} as Record<ToolName, string | null>;
  for (const name of TOOL_NAMES) {
    const onAgent = attached.get(name);
    if (onAgent) {
      existingToolIds[name] = onAgent;
      continue;
    }
    // A tool from a run that failed before the agent was saved. Reuse it instead of making a duplicate.
    const [unused, ...more] = await api.findUnusedToolIds(name);
    existingToolIds[name] = unused ?? null;
    if (more.length > 0) {
      log(
        `Note: ${more.length} more unused tool(s) named ${name}: ${more.join(", ")}. Delete them in the dashboard.`,
      );
    }
  }

  const foundSecretId = await api.findSecretId(SECRET_NAME);

  // 3. Writes.
  let secretId: string;
  let secretWritten = true;
  if (!foundSecretId) {
    log(`Secret ${SECRET_NAME}: create`);
    secretId = await api.createSecret(buildSecretCreatePayload(config.voiceToolSecret));
    log(`  -> ${secretId}`);
  } else if (config.rotateSecret) {
    secretId = foundSecretId;
    log(ROTATE_WARNING);
    log(`Secret ${SECRET_NAME}: update ${secretId} with a new value`);
    await api.updateSecret(secretId, buildSecretUpdatePayload(config.voiceToolSecret));
  } else {
    secretId = foundSecretId;
    secretWritten = false;
    log(`Secret ${SECRET_NAME}: keep ${secretId} unchanged`);
    log(`  ${KEEP_SECRET_NOTE}`);
  }

  const toolIds = {} as Record<ToolName, string>;
  for (const name of TOOL_NAMES) {
    const body = buildToolPayload(name, assets.toolTemplates[name], {
      publicBaseUrl: config.publicBaseUrl,
      secretId,
    });
    const existingId = existingToolIds[name];
    if (existingId) {
      log(`Tool ${name}: update ${existingId}`);
      await api.updateTool(existingId, body);
      toolIds[name] = existingId;
    } else {
      log(`Tool ${name}: create`);
      toolIds[name] = await api.createTool(body);
      log(`  -> ${toolIds[name]}`);
    }
  }

  const agentInput = {
    config,
    systemPrompt: assets.systemPrompt,
    firstMessage: assets.firstMessage,
    toolIds: TOOL_NAMES.map((name) => toolIds[name]),
  };
  let agentId: string;
  let agentCreated = false;
  if (config.agentId) {
    agentId = config.agentId;
    log(`Agent "${config.agentName}": update ${agentId}`);
    await api.updateAgent(agentId, buildAgentUpdatePayload(agentInput));
  } else {
    log(`Agent "${config.agentName}": create`);
    agentId = await api.createAgent(buildAgentCreatePayload(agentInput));
    agentCreated = true;
    log(`  -> ${agentId}`);
    log(`  Save it now: ELEVENLABS_AGENT_ID=${agentId}`);
  }

  if (config.phoneNumberId) {
    log(`Phone number ${config.phoneNumberId}: route to ${agentId}`);
    await api.updatePhoneNumber(config.phoneNumberId, buildPhoneNumberUpdatePayload(agentId));
  }

  return {
    secretId,
    secretWritten,
    toolIds,
    agentId,
    agentCreated,
    phoneNumberId: config.phoneNumberId,
  };
}
