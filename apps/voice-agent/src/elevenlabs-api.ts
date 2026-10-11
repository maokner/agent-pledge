/**
 * The real ProvisionApi, built on the official SDK (@elevenlabs/elevenlabs-js).
 * Every body goes through toSdk, which rejects any payload that the SDK would not send unchanged.
 */
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import type { ProvisionApi } from "./provision.js";
import { toSdk } from "./sdk-payloads.js";

export interface ElevenLabsApiOptions {
  apiKey: string;
  baseUrl: string | null;
  /** Replaces the network, for tests. */
  fetch?: typeof fetch;
}

function isNotFound(err: unknown): boolean {
  return err instanceof ElevenLabsError && err.statusCode === 404;
}

export function createElevenLabsApi(options: ElevenLabsApiOptions): ProvisionApi {
  const client = new ElevenLabsClient({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch, maxRetries: 0 } : {}),
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
      let agent: Awaited<ReturnType<typeof ai.agents.get>>;
      try {
        agent = await ai.agents.get(agentId);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
      const toolIds = agent.conversationConfig.agent?.prompt?.toolIds ?? [];
      const byName = new Map<string, string>();
      for (const id of toolIds) {
        try {
          const tool = await ai.tools.get(id);
          if (tool.toolConfig.type === "webhook") byName.set(tool.toolConfig.name, tool.id);
        } catch (err) {
          // A tool deleted in the dashboard is still listed on the agent. Skip it; provisioning recreates it.
          if (isNotFound(err)) continue;
          throw err;
        }
      }
      return byName;
    },

    async findUnusedToolIds(name) {
      // `search` matches a name prefix, so keep only exact names. SDK 2.71.0 has no used_by_agent_id filter yet.
      const candidates: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await ai.tools.list({
          search: name,
          types: "webhook",
          pageSize: 100,
          ...(cursor ? { cursor } : {}),
        });
        for (const tool of page.tools) {
          if (tool.toolConfig.type === "webhook" && tool.toolConfig.name === name) {
            candidates.push(tool.id);
          }
        }
        cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
      } while (cursor);
      // Never take over a tool that an agent uses, for example a teammate's agent made with --create-new.
      const unused: string[] = [];
      for (const id of candidates) {
        const dependents = await ai.tools.getDependentAgents(id, { pageSize: 1 });
        if (dependents.agents.length === 0 && !dependents.hasMore && !dependents.branches?.length) {
          unused.push(id);
        }
      }
      return unused;
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
