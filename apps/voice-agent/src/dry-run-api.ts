/**
 * A ProvisionApi that makes no network calls.
 * It records each write with its HTTP method, path, and exact body, and returns placeholder ids.
 * The dry run cannot see the workspace, so each read returns an assumption, which `skippedReads` lists:
 *   - without ELEVENLABS_AGENT_ID: nothing exists yet, so a real run creates everything (POST);
 *   - with ELEVENLABS_AGENT_ID: the agent, its two tools, and the secret exist, so a real run updates them (PATCH).
 * Each body goes through the same strict SDK check as the real client, so a dry run catches invalid payloads.
 */
import { TOOL_NAMES } from "./assets.js";
import type { ProvisionApi } from "./provision.js";
import { toSdk } from "./sdk-payloads.js";
import { describeServerCheck, type CheckResult } from "./simulate.js";

export interface RecordedCall {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body: unknown;
}

export const REDACTED = "<redacted>";

export const placeholder = {
  secretId: (name: string) => `<secret_id of ${name}>`,
  newToolId: (name: string) => `<tool_id of ${name}>`,
  agentToolId: (name: string, agentId: string) => `<tool_id of ${name} on ${agentId}>`,
  newAgentId: "<agent_id of the new agent>",
};

export interface DryRunOptions {
  /** ELEVENLABS_AGENT_ID. When set, the dry run assumes that the agent, its tools, and the secret exist. */
  existingAgentId: string | null;
}

export class DryRunApi implements ProvisionApi {
  readonly calls: RecordedCall[] = [];
  readonly skippedReads: string[] = [];
  /** The server checks that a real run makes first. */
  readonly plannedServerChecks: string[] = [];
  private readonly existingAgentId: string | null;

  constructor(options: DryRunOptions) {
    this.existingAgentId = options.existingAgentId;
  }

  private record(method: RecordedCall["method"], path: string, body: unknown): void {
    this.calls.push({ method, path, body });
  }

  private skipRead(read: string, assumed: string): void {
    this.skippedReads.push(`${read} (assumed: ${assumed})`);
  }

  /** A ServerCheck that records the plan instead of calling the server. */
  readonly checkServer = async (baseUrl: string): Promise<CheckResult[]> => {
    this.plannedServerChecks.push(...describeServerCheck(baseUrl));
    return [];
  };

  async findSecretId(name: string): Promise<string | null> {
    const read = `GET /v1/convai/secrets?search=${encodeURIComponent(name)}`;
    if (this.existingAgentId) {
      this.skipRead(read, "the secret exists, because the agent exists");
      return placeholder.secretId(name);
    }
    this.skipRead(read, "no secret with this name");
    return null;
  }

  async createSecret(body: { type: "new"; name: string; value: string }): Promise<string> {
    toSdk.secretCreate(body);
    this.record("POST", "/v1/convai/secrets", { ...body, value: REDACTED });
    return placeholder.secretId(body.name);
  }

  async updateSecret(
    secretId: string,
    body: { type: "update"; name: string; value: string },
  ): Promise<void> {
    toSdk.secretUpdate(body);
    this.record("PATCH", `/v1/convai/secrets/${secretId}`, { ...body, value: REDACTED });
  }

  async findAgentIdsByName(name: string): Promise<string[]> {
    this.skipRead(
      `GET /v1/convai/agents?search=${encodeURIComponent(name)}`,
      "no agent with this name",
    );
    return [];
  }

  async getAgentTools(agentId: string): Promise<Map<string, string>> {
    this.skipRead(
      `GET /v1/convai/agents/${agentId} and GET /v1/convai/tools/{tool_id}`,
      `the agent exists and has both tools`,
    );
    return new Map(TOOL_NAMES.map((name) => [name, placeholder.agentToolId(name, agentId)]));
  }

  async findUnusedToolIds(name: string): Promise<string[]> {
    this.skipRead(
      `GET /v1/convai/tools?search=${encodeURIComponent(name)} and GET /v1/convai/tools/{tool_id}/dependent-agents`,
      "no unused tool with this name",
    );
    return [];
  }

  async createTool(body: Parameters<ProvisionApi["createTool"]>[0]): Promise<string> {
    toSdk.tool(body);
    this.record("POST", "/v1/convai/tools", body);
    const name = body.tool_config.type === "webhook" ? body.tool_config.name : "tool";
    return placeholder.newToolId(name);
  }

  async updateTool(toolId: string, body: Parameters<ProvisionApi["updateTool"]>[1]): Promise<void> {
    toSdk.tool(body);
    this.record("PATCH", `/v1/convai/tools/${toolId}`, body);
  }

  async createAgent(body: Parameters<ProvisionApi["createAgent"]>[0]): Promise<string> {
    toSdk.agentCreate(body);
    this.record("POST", "/v1/convai/agents/create", body);
    return placeholder.newAgentId;
  }

  async updateAgent(
    agentId: string,
    body: Parameters<ProvisionApi["updateAgent"]>[1],
  ): Promise<void> {
    toSdk.agentUpdate(body);
    this.record("PATCH", `/v1/convai/agents/${agentId}`, body);
  }

  async updatePhoneNumber(
    phoneNumberId: string,
    body: Parameters<ProvisionApi["updatePhoneNumber"]>[1],
  ): Promise<void> {
    toSdk.phoneNumberUpdate(body);
    this.record("PATCH", `/v1/convai/phone-numbers/${phoneNumberId}`, body);
  }
}
