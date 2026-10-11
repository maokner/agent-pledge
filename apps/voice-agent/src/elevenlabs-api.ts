/**
 * The real ProvisionApi, built on the official SDK (@elevenlabs/elevenlabs-js).
 * Every body goes through toSdk, which rejects any payload that the SDK would not send unchanged.
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { ProvisionApi } from "./provision.js";
import { toSdk } from "./sdk-payloads.js";

export interface ElevenLabsApiOptions {
  apiKey: string;
  baseUrl: string | null;
}

export function createElevenLabsApi(options: ElevenLabsApiOptions): ProvisionApi {
  const client = new ElevenLabsClient({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });
  const ai = client.conversationalAi;

  return {
    async findSecretId(name) {
      const { secrets } = await ai.secrets.list({ search: name });
      return secrets.find((s) => s.name === name)?.secretId ?? null;
    },

    async createSecret(body) {
      return (await ai.secrets.create(toSdk.secretCreate(body))).secretId;
    },

    async updateSecret(secretId, body) {
      await ai.secrets.update(secretId, toSdk.secretUpdate(body));
    },

    async findAgentIdsByName(name) {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await ai.agents.list({
          search: name,
          pageSize: 100,
          ...(cursor ? { cursor } : {}),
        });
        ids.push(...page.agents.filter((a) => a.name === name).map((a) => a.agentId));
        cursor = page.hasMore ? page.nextCursor : undefined;
      } while (cursor);
      return ids;
    },

    async getAgentTools(agentId) {
      const agent = await ai.agents.get(agentId);
      const toolIds = agent.conversationConfig.agent?.prompt?.toolIds ?? [];
      const byName = new Map<string, string>();
      for (const id of toolIds) {
        const tool = await ai.tools.get(id);
        if (tool.toolConfig.type === "webhook") byName.set(tool.toolConfig.name, tool.id);
      }
      return byName;
    },

    async createTool(body) {
      return (await ai.tools.create(toSdk.tool(body))).id;
    },

    async updateTool(toolId, body) {
      await ai.tools.update(toolId, toSdk.tool(body));
    },

    async createAgent(body) {
      return (await ai.agents.create(toSdk.agentCreate(body))).agentId;
    },

    async updateAgent(agentId, body) {
      await ai.agents.update(agentId, toSdk.agentUpdate(body));
    },

    async updatePhoneNumber(phoneNumberId, body) {
      await ai.phoneNumbers.update(phoneNumberId, toSdk.phoneNumberUpdate(body));
    },
  };
}
