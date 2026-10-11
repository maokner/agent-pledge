/**
 * Creates or updates the ElevenLabs agent, its two server tools, the tool secret, and the phone number link.
 * The steps talk to a ProvisionApi, so the same code runs against the real API, the dry run, and test fakes.
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

/** The ElevenLabs operations that provisioning needs. Bodies are in the exact wire format. */
export interface ProvisionApi {
  /** Returns the id of the workspace secret with this exact name, or null. */
  findSecretId(name: string): Promise<string | null>;
  createSecret(body: SecretCreateWire): Promise<string>;
  updateSecret(secretId: string, body: SecretUpdateWire): Promise<void>;
  /** Returns the ids of agents with this exact name. */
  findAgentIdsByName(name: string): Promise<string[]>;
  /** Returns the tool ids attached to the agent, by tool name. */
  getAgentTools(agentId: string): Promise<Map<string, string>>;
  createTool(body: ToolWire): Promise<string>;
  updateTool(toolId: string, body: ToolWire): Promise<void>;
  createAgent(body: AgentCreateWire): Promise<string>;
  updateAgent(agentId: string, body: AgentUpdateWire): Promise<void>;
  updatePhoneNumber(phoneNumberId: string, body: PhoneNumberUpdateWire): Promise<void>;
}

export interface ProvisionResult {
  secretId: string;
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

export async function provision(
  config: ProvisionConfig,
  assets: AgentAssets,
  api: ProvisionApi,
  log: (line: string) => void = () => {},
): Promise<ProvisionResult> {
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

  log(`Secret ${SECRET_NAME}`);
  let secretId = await api.findSecretId(SECRET_NAME);
  if (secretId) {
    await api.updateSecret(secretId, buildSecretUpdatePayload(config.voiceToolSecret));
    log(`  updated ${secretId}`);
  } else {
    secretId = await api.createSecret(buildSecretCreatePayload(config.voiceToolSecret));
    log(`  created ${secretId}`);
  }

  const attached = config.agentId
    ? await api.getAgentTools(config.agentId)
    : new Map<string, string>();
  const toolIds = {} as Record<ToolName, string>;
  for (const name of TOOL_NAMES) {
    const body = buildToolPayload(name, assets.toolTemplates[name], {
      publicBaseUrl: config.publicBaseUrl,
      secretId,
    });
    const existingId = attached.get(name);
    log(`Tool ${name}`);
    if (existingId) {
      await api.updateTool(existingId, body);
      toolIds[name] = existingId;
      log(`  updated ${existingId}`);
    } else {
      toolIds[name] = await api.createTool(body);
      log(`  created ${toolIds[name]}`);
    }
  }

  const agentInput = {
    config,
    systemPrompt: assets.systemPrompt,
    firstMessage: assets.firstMessage,
    toolIds: TOOL_NAMES.map((name) => toolIds[name]),
  };
  log(`Agent "${config.agentName}"`);
  let agentId: string;
  let agentCreated = false;
  if (config.agentId) {
    agentId = config.agentId;
    await api.updateAgent(agentId, buildAgentUpdatePayload(agentInput));
    log(`  updated ${agentId}`);
  } else {
    agentId = await api.createAgent(buildAgentCreatePayload(agentInput));
    agentCreated = true;
    log(`  created ${agentId}`);
  }

  if (config.phoneNumberId) {
    log(`Phone number ${config.phoneNumberId}`);
    await api.updatePhoneNumber(config.phoneNumberId, buildPhoneNumberUpdatePayload(agentId));
    log(`  now answered by ${agentId}`);
  }

  return { secretId, toolIds, agentId, agentCreated, phoneNumberId: config.phoneNumberId };
}
