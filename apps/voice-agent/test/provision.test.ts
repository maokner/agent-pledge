import { describe, expect, it } from "vitest";
import { loadAssets } from "../src/assets.js";
import { loadProvisionConfig, type ProvisionConfig } from "../src/config.js";
import { DryRunApi, REDACTED } from "../src/dry-run-api.js";
import { SECRET_NAME } from "../src/payloads.js";
import { ProvisionError, provision, type ProvisionApi } from "../src/provision.js";
import type { AgentCreateWire, AgentUpdateWire, ToolWire } from "../src/sdk-payloads.js";

const assets = loadAssets();
const SECRET = "0123456789abcdef-secret";

function config(env: Record<string, string> = {}, createNew = false): ProvisionConfig {
  return loadProvisionConfig(
    {
      ELEVENLABS_API_KEY: "k",
      PUBLIC_BASE_URL: "https://pledge.example.com",
      VOICE_TOOL_SECRET: SECRET,
      ...env,
    },
    { dryRun: false, createNew },
  ).config;
}

/** An in-memory ElevenLabs workspace. */
class FakeWorkspace implements ProvisionApi {
  secrets = new Map<string, { name: string; value: string }>();
  tools = new Map<string, ToolWire>();
  agents = new Map<
    string,
    { name: string; toolIds: string[]; body: AgentCreateWire | AgentUpdateWire }
  >();
  phoneNumbers = new Map<string, string | null>([["phnum_1", null]]);
  writes: string[] = [];
  private n = 0;
  private id(prefix: string) {
    return `${prefix}_${++this.n}`;
  }

  async findSecretId(name: string) {
    return [...this.secrets].find(([, s]) => s.name === name)?.[0] ?? null;
  }
  async createSecret(body: { name: string; value: string }) {
    const id = this.id("secret");
    this.secrets.set(id, { name: body.name, value: body.value });
    this.writes.push(`create secret ${id}`);
    return id;
  }
  async updateSecret(id: string, body: { name: string; value: string }) {
    this.secrets.set(id, { name: body.name, value: body.value });
    this.writes.push(`update secret ${id}`);
  }
  async findAgentIdsByName(name: string) {
    return [...this.agents].filter(([, a]) => a.name === name).map(([id]) => id);
  }
  async getAgentTools(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`404 agent ${agentId}`);
    const map = new Map<string, string>();
    for (const id of agent.toolIds) {
      const cfg = this.tools.get(id)?.tool_config;
      if (cfg?.type === "webhook") map.set(cfg.name, id);
    }
    return map;
  }
  async createTool(body: ToolWire) {
    const id = this.id("tool");
    this.tools.set(id, body);
    this.writes.push(`create tool ${id}`);
    return id;
  }
  async updateTool(id: string, body: ToolWire) {
    this.tools.set(id, body);
    this.writes.push(`update tool ${id}`);
  }
  async createAgent(body: AgentCreateWire) {
    const id = this.id("agent");
    this.agents.set(id, {
      name: body.name ?? "",
      toolIds: body.conversation_config.agent?.prompt?.tool_ids ?? [],
      body,
    });
    this.writes.push(`create agent ${id}`);
    return id;
  }
  async updateAgent(id: string, body: AgentUpdateWire) {
    if (!this.agents.has(id)) throw new Error(`404 agent ${id}`);
    this.agents.set(id, {
      name: body.name ?? "",
      toolIds: body.conversation_config?.agent?.prompt?.tool_ids ?? [],
      body,
    });
    this.writes.push(`update agent ${id}`);
  }
  async updatePhoneNumber(id: string, body: { agent_id?: string | null }) {
    if (!this.phoneNumbers.has(id)) throw new Error(`404 phone ${id}`);
    this.phoneNumbers.set(id, body.agent_id ?? null);
    this.writes.push(`update phone ${id}`);
  }
}

describe("provision", () => {
  it("creates the secret, both tools, and the agent on the first run", async () => {
    const ws = new FakeWorkspace();
    const result = await provision(config(), assets, ws);
    expect(ws.writes).toEqual([
      "create secret secret_1",
      "create tool tool_2",
      "create tool tool_3",
      "create agent agent_4",
    ]);
    expect(result).toEqual({
      secretId: "secret_1",
      toolIds: { create_task: "tool_2", task_status: "tool_3" },
      agentId: "agent_4",
      agentCreated: true,
      phoneNumberId: null,
    });
    expect(ws.secrets.get("secret_1")).toEqual({ name: SECRET_NAME, value: SECRET });
    expect(ws.agents.get("agent_4")?.toolIds).toEqual(["tool_2", "tool_3"]);
  });

  it("updates in place on the next run with ELEVENLABS_AGENT_ID (idempotent)", async () => {
    const ws = new FakeWorkspace();
    const first = await provision(config(), assets, ws);
    ws.writes = [];
    const second = await provision(config({ ELEVENLABS_AGENT_ID: first.agentId }), assets, ws);
    expect(ws.writes).toEqual([
      "update secret secret_1",
      "update tool tool_2",
      "update tool tool_3",
      "update agent agent_4",
    ]);
    expect({ ...second, agentCreated: true }).toEqual(first);
    expect(ws.tools.size).toBe(2);
    expect(ws.agents.size).toBe(1);
  });

  it("points the tools at a new PUBLIC_BASE_URL on update", async () => {
    const ws = new FakeWorkspace();
    const first = await provision(config(), assets, ws);
    await provision(
      config({ ELEVENLABS_AGENT_ID: first.agentId, PUBLIC_BASE_URL: "https://new.example.com" }),
      assets,
      ws,
    );
    const tool = ws.tools.get(first.toolIds.create_task)?.tool_config;
    expect(tool?.type === "webhook" && tool.api_schema.url).toBe(
      "https://new.example.com/tools/create_task",
    );
  });

  it("refuses to create a second agent with the same name", async () => {
    const ws = new FakeWorkspace();
    await provision(config(), assets, ws);
    await expect(provision(config(), assets, ws)).rejects.toThrow(ProvisionError);
    await expect(provision(config(), assets, ws)).rejects.toThrow(/ELEVENLABS_AGENT_ID/);
    expect(ws.agents.size).toBe(1);
  });

  it("creates a second agent only with --create-new", async () => {
    const ws = new FakeWorkspace();
    await provision(config(), assets, ws);
    await provision(config({}, true), assets, ws);
    expect(ws.agents.size).toBe(2);
  });

  it("attaches the phone number to the agent when ELEVENLABS_PHONE_NUMBER_ID is set", async () => {
    const ws = new FakeWorkspace();
    const result = await provision(config({ ELEVENLABS_PHONE_NUMBER_ID: "phnum_1" }), assets, ws);
    expect(ws.phoneNumbers.get("phnum_1")).toBe(result.agentId);
    expect(result.phoneNumberId).toBe("phnum_1");
  });

  it("stops before any write when the agent id does not exist", async () => {
    const ws = new FakeWorkspace();
    await expect(
      provision(config({ ELEVENLABS_AGENT_ID: "agent_missing" }), assets, ws),
    ).rejects.toThrow(/404/);
    expect(ws.writes).toEqual(["create secret secret_1"]);
  });
});

describe("dry run", () => {
  const dryConfig = (env: Record<string, string> = {}) =>
    loadProvisionConfig(env, { dryRun: true, createNew: false }).config;

  it("records every request in order, with exact paths", async () => {
    const api = new DryRunApi();
    await provision(dryConfig({ ELEVENLABS_PHONE_NUMBER_ID: "phnum_1" }), assets, api);
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /v1/convai/secrets",
      "POST /v1/convai/tools",
      "POST /v1/convai/tools",
      "POST /v1/convai/agents/create",
      "PATCH /v1/convai/phone-numbers/phnum_1",
    ]);
  });

  it("uses PATCH for the agent when ELEVENLABS_AGENT_ID is set", async () => {
    const api = new DryRunApi();
    await provision(dryConfig({ ELEVENLABS_AGENT_ID: "agent_9" }), assets, api);
    expect(api.calls.at(-1)?.method).toBe("PATCH");
    expect(api.calls.at(-1)?.path).toBe("/v1/convai/agents/agent_9");
  });

  it("never records the secret value", async () => {
    const api = new DryRunApi();
    await provision(dryConfig({ VOICE_TOOL_SECRET: SECRET }), assets, api);
    const printed = JSON.stringify(api.calls);
    expect(printed).not.toContain(SECRET);
    expect(api.calls[0]?.body).toEqual({ type: "new", name: SECRET_NAME, value: REDACTED });
  });

  it("links the tools to the secret and the agent to the tools with placeholder ids", async () => {
    const api = new DryRunApi();
    await provision(dryConfig(), assets, api);
    const [, createTask, , agent] = api.calls;
    expect(JSON.stringify(createTask?.body)).toContain(`<secret_id of ${SECRET_NAME}>`);
    expect(JSON.stringify(agent?.body)).toContain("<tool_id of create_task>");
    expect(JSON.stringify(agent?.body)).toContain("<tool_id of task_status>");
  });

  it("fails like a real run on an invalid payload", async () => {
    const api = new DryRunApi();
    await expect(provision(dryConfig({ ELEVENLABS_LLM: "gpt-99" }), assets, api)).rejects.toThrow(
      /llm/,
    );
  });
});
