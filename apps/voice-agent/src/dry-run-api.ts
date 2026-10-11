/**
 * A ProvisionApi that makes no network calls.
 * It records each write with its HTTP method, path, and exact body, and returns placeholder ids.
 * Reads return "nothing exists yet", because the dry run cannot see the workspace.
 * Each body goes through the same strict SDK check as the real client, so a dry run catches invalid payloads.
 */
import type { ProvisionApi } from "./provision.js";
import { toSdk } from "./sdk-payloads.js";

export interface RecordedCall {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body: unknown;
}

export const REDACTED = "<redacted>";

export class DryRunApi implements ProvisionApi {
  readonly calls: RecordedCall[] = [];
  readonly skippedReads: string[] = [];

  private record(method: RecordedCall["method"], path: string, body: unknown): void {
    this.calls.push({ method, path, body });
  }

  async findSecretId(name: string): Promise<string | null> {
    this.skippedReads.push(`GET /v1/convai/secrets?search=${encodeURIComponent(name)}`);
    return null;
  }

  async createSecret(body: { type: "new"; name: string; value: string }): Promise<string> {
    toSdk.secretCreate(body);
    this.record("POST", "/v1/convai/secrets", { ...body, value: REDACTED });
    return `<secret_id of ${body.name}>`;
  }

  async updateSecret(
    secretId: string,
    body: { type: "update"; name: string; value: string },
  ): Promise<void> {
    toSdk.secretUpdate(body);
    this.record("PATCH", `/v1/convai/secrets/${secretId}`, { ...body, value: REDACTED });
  }

  async findAgentIdsByName(name: string): Promise<string[]> {
    this.skippedReads.push(`GET /v1/convai/agents?search=${encodeURIComponent(name)}`);
    return [];
  }

  async getAgentTools(agentId: string): Promise<Map<string, string>> {
    this.skippedReads.push(`GET /v1/convai/agents/${agentId} and GET /v1/convai/tools/{tool_id}`);
    return new Map();
  }

  async createTool(body: Parameters<ProvisionApi["createTool"]>[0]): Promise<string> {
    toSdk.tool(body);
    this.record("POST", "/v1/convai/tools", body);
    const name = body.tool_config.type === "webhook" ? body.tool_config.name : "tool";
    return `<tool_id of ${name}>`;
  }

  async updateTool(toolId: string, body: Parameters<ProvisionApi["updateTool"]>[1]): Promise<void> {
    toSdk.tool(body);
    this.record("PATCH", `/v1/convai/tools/${toolId}`, body);
  }

  async createAgent(body: Parameters<ProvisionApi["createAgent"]>[0]): Promise<string> {
    toSdk.agentCreate(body);
    this.record("POST", "/v1/convai/agents/create", body);
    return "<agent_id of the new agent>";
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
