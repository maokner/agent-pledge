import { describe, expect, it } from "vitest";
import { loadAssets } from "../src/assets.js";
import { loadProvisionConfig, type ProvisionConfig } from "../src/config.js";
import { DryRunApi, REDACTED } from "../src/dry-run-api.js";
import { SECRET_NAME } from "../src/payloads.js";
import {
  KEEP_SECRET_NOTE,
  ROTATE_WARNING,
  ProvisionError,
  provision,
  type ProvisionApi,
  type ProvisionOptions,
} from "../src/provision.js";
import type { AgentCreateWire, AgentUpdateWire, ToolWire } from "../src/sdk-payloads.js";
import type { CheckResult } from "../src/simulate.js";

const assets = loadAssets();
const SECRET = "0123456789abcdef-secret";

interface Flags {
  createNew?: boolean;
  rotateSecret?: boolean;
  skipServerCheck?: boolean;
}

function config(env: Record<string, string> = {}, flags: Flags = {}): ProvisionConfig {
  return loadProvisionConfig(
    {
      ELEVENLABS_API_KEY: "k",
      PUBLIC_BASE_URL: "https://pledge.example.com",
      VOICE_TOOL_SECRET: SECRET,
      ...env,
    },
    { dryRun: false, createNew: false, ...flags },
  ).config;
}

const PASSING: CheckResult[] = [{ name: "server: GET /health answers 200", ok: true, detail: "" }];

/** An in-memory ElevenLabs workspace. `events` lists every server check, read, and write, in order. */
class FakeWorkspace implements ProvisionApi {
  secrets = new Map<string, { name: string; value: string }>();
  tools = new Map<string, ToolWire>();
  agents = new Map<
    string,
    { name: string; toolIds: string[]; body: AgentCreateWire | AgentUpdateWire }
  >();
  phoneNumbers = new Map<string, string | null>([["phnum_1", null]]);
  events: string[] = [];
  logs: string[] = [];
  checkResults: CheckResult[] = PASSING;
  failNextAgentCreate = false;
  private n = 0;
  private id(prefix: string) {
    return `${prefix}_${++this.n}`;
  }

  get writes(): string[] {
    return this.events.filter((e) => /^(create|update) /.test(e));
  }

  options(): ProvisionOptions {
    return {
      log: (line) => this.logs.push(line),
      checkServer: async (baseUrl, secret) => {
        this.events.push(`check ${baseUrl} ${secret === SECRET ? "secret" : "other secret"}`);
        return this.checkResults;
      },
    };
  }

  async findSecretId(name: string) {
    this.events.push("read secrets");
    return [...this.secrets].find(([, s]) => s.name === name)?.[0] ?? null;
  }
  async createSecret(body: { name: string; value: string }) {
    const id = this.id("secret");
    this.secrets.set(id, { name: body.name, value: body.value });
    this.events.push(`create secret ${id}`);
    return id;
  }
  async updateSecret(id: string, body: { name: string; value: string }) {
    this.secrets.set(id, { name: body.name, value: body.value });
    this.events.push(`update secret ${id}`);
  }
  async findAgentIdsByName(name: string) {
    this.events.push("read agents");
    return [...this.agents].filter(([, a]) => a.name === name).map(([id]) => id);
  }
  async getAgentTools(agentId: string) {
    this.events.push(`read agent ${agentId}`);
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    const map = new Map<string, string>();
    for (const id of agent.toolIds) {
      const cfg = this.tools.get(id)?.tool_config;
      if (cfg?.type === "webhook") map.set(cfg.name, id);
    }
    return map;
  }
  async findUnusedToolIds(name: string) {
    this.events.push(`read tools ${name}`);
    const used = new Set([...this.agents.values()].flatMap((a) => a.toolIds));
    return [...this.tools]
      .filter(([, t]) => t.tool_config.type === "webhook" && t.tool_config.name === name)
      .map(([id]) => id)
      .filter((id) => !used.has(id));
  }
  async createTool(body: ToolWire) {
    const id = this.id("tool");
    this.tools.set(id, body);
    this.events.push(`create tool ${id}`);
    return id;
  }
  async updateTool(id: string, body: ToolWire) {
    this.tools.set(id, body);
    this.events.push(`update tool ${id}`);
  }
  async createAgent(body: AgentCreateWire) {
    if (this.failNextAgentCreate) {
      this.failNextAgentCreate = false;
      throw new Error("422 invalid agent");
    }
    const id = this.id("agent");
    this.agents.set(id, {
      name: body.name ?? "",
      toolIds: body.conversation_config.agent?.prompt?.tool_ids ?? [],
      body,
    });
    this.events.push(`create agent ${id}`);
    return id;
  }
  async updateAgent(id: string, body: AgentUpdateWire) {
    if (!this.agents.has(id)) throw new Error(`404 agent ${id}`);
    this.agents.set(id, {
      name: body.name ?? "",
      toolIds: body.conversation_config?.agent?.prompt?.tool_ids ?? [],
      body,
    });
    this.events.push(`update agent ${id}`);
  }
  async updatePhoneNumber(id: string, body: { agent_id?: string | null }) {
    if (!this.phoneNumbers.has(id)) throw new Error(`404 phone ${id}`);
    this.phoneNumbers.set(id, body.agent_id ?? null);
    this.events.push(`update phone ${id}`);
  }
}

async function run(ws: FakeWorkspace, cfg: ProvisionConfig = config()) {
  return provision(cfg, assets, ws, ws.options());
}

describe("provision", () => {
  it("creates the secret, both tools, and the agent on the first run", async () => {
    const ws = new FakeWorkspace();
    const result = await run(ws);
    expect(ws.writes).toEqual([
      "create secret secret_1",
      "create tool tool_2",
      "create tool tool_3",
      "create agent agent_4",
    ]);
    expect(result).toEqual({
      secretId: "secret_1",
      secretWritten: true,
      toolIds: { create_task: "tool_2", task_status: "tool_3" },
      agentId: "agent_4",
      agentCreated: true,
      phoneNumberId: null,
    });
    expect(ws.secrets.get("secret_1")).toEqual({ name: SECRET_NAME, value: SECRET });
    expect(ws.agents.get("agent_4")?.toolIds).toEqual(["tool_2", "tool_3"]);
    expect(ws.logs).toContain("  Save it now: ELEVENLABS_AGENT_ID=agent_4");
  });

  it("updates the tools and the agent in place on the next run, and keeps the secret", async () => {
    const ws = new FakeWorkspace();
    const first = await run(ws);
    ws.events = [];
    ws.logs = [];
    const second = await run(ws, config({ ELEVENLABS_AGENT_ID: first.agentId }));
    expect(ws.writes).toEqual(["update tool tool_2", "update tool tool_3", "update agent agent_4"]);
    expect(second).toEqual({ ...first, secretWritten: false, agentCreated: false });
    expect(ws.tools.size).toBe(2);
    expect(ws.agents.size).toBe(1);
    expect(ws.logs).toContain(`Secret ${SECRET_NAME}: keep secret_1 unchanged`);
    expect(ws.logs).toContain(`  ${KEEP_SECRET_NOTE}`);
    expect(ws.logs.join("\n")).not.toContain("WARNING");
  });

  it("never changes an existing secret without --rotate-secret", async () => {
    const ws = new FakeWorkspace();
    const first = await run(ws);
    await run(
      ws,
      config({
        ELEVENLABS_AGENT_ID: first.agentId,
        VOICE_TOOL_SECRET: "another-secret-value-1234",
      }),
    );
    expect(ws.secrets.get("secret_1")?.value).toBe(SECRET);
    expect(ws.writes).not.toContain("update secret secret_1");
  });

  it("replaces an existing secret with --rotate-secret and warns that it is shared", async () => {
    const ws = new FakeWorkspace();
    const first = await run(ws);
    ws.events = [];
    ws.logs = [];
    const rotated = "another-secret-value-1234";
    const result = await run(
      ws,
      config(
        { ELEVENLABS_AGENT_ID: first.agentId, VOICE_TOOL_SECRET: rotated },
        { rotateSecret: true },
      ),
    );
    expect(ws.writes[0]).toBe("update secret secret_1");
    expect(ws.secrets.get("secret_1")?.value).toBe(rotated);
    expect(result.secretWritten).toBe(true);
    expect(ws.logs).toContain(ROTATE_WARNING);
    expect(ROTATE_WARNING).toMatch(/^WARNING: .*Every agent in this ElevenLabs workspace uses it/);
  });

  it("creates the secret when it does not exist, with or without --rotate-secret", async () => {
    const ws = new FakeWorkspace();
    await run(ws, config({}, { rotateSecret: true }));
    expect(ws.writes[0]).toBe("create secret secret_1");
    expect(ws.logs.join("\n")).not.toContain("WARNING");
  });

  it("points the tools at a new PUBLIC_BASE_URL on update", async () => {
    const ws = new FakeWorkspace();
    const first = await run(ws);
    await run(
      ws,
      config({ ELEVENLABS_AGENT_ID: first.agentId, PUBLIC_BASE_URL: "https://new.example.com" }),
    );
    const tool = ws.tools.get(first.toolIds.create_task)?.tool_config;
    expect(tool?.type === "webhook" && tool.api_schema.url).toBe(
      "https://new.example.com/tools/create_task",
    );
  });

  it("refuses to create a second agent with the same name", async () => {
    const ws = new FakeWorkspace();
    await run(ws);
    await expect(run(ws)).rejects.toThrow(ProvisionError);
    await expect(run(ws)).rejects.toThrow(/ELEVENLABS_AGENT_ID/);
    expect(ws.agents.size).toBe(1);
  });

  it("creates a second agent with its own tools only with --create-new", async () => {
    const ws = new FakeWorkspace();
    const first = await run(ws);
    const second = await run(ws, config({}, { createNew: true }));
    expect(ws.agents.size).toBe(2);
    expect(ws.tools.size).toBe(4);
    expect(second.toolIds).not.toEqual(first.toolIds);
  });

  it("attaches the phone number to the agent when ELEVENLABS_PHONE_NUMBER_ID is set", async () => {
    const ws = new FakeWorkspace();
    const result = await run(ws, config({ ELEVENLABS_PHONE_NUMBER_ID: "phnum_1" }));
    expect(ws.phoneNumbers.get("phnum_1")).toBe(result.agentId);
    expect(result.phoneNumberId).toBe("phnum_1");
  });

  it("fails before any write when ELEVENLABS_AGENT_ID does not exist, and says what to do", async () => {
    const ws = new FakeWorkspace();
    const attempt = run(ws, config({ ELEVENLABS_AGENT_ID: "agent_missing" }));
    await expect(attempt).rejects.toThrow(ProvisionError);
    await expect(attempt).rejects.toThrow(/agent_missing/);
    await expect(attempt).rejects.toThrow(/Unset ELEVENLABS_AGENT_ID/);
    await expect(attempt).rejects.toThrow(/--create-new/);
    expect(ws.writes).toEqual([]);
  });

  it("reuses the tools from a failed first run instead of making duplicates", async () => {
    const ws = new FakeWorkspace();
    ws.failNextAgentCreate = true;
    await expect(run(ws)).rejects.toThrow(/422/);
    expect(ws.tools.size).toBe(2);
    ws.events = [];
    const result = await run(ws);
    expect(ws.writes).toEqual(["update tool tool_2", "update tool tool_3", "create agent agent_4"]);
    expect(ws.tools.size).toBe(2);
    expect(result.toolIds).toEqual({ create_task: "tool_2", task_status: "tool_3" });
  });

  it("finds a tool by name when the agent lost it", async () => {
    const ws = new FakeWorkspace();
    const first = await run(ws);
    const agent = ws.agents.get(first.agentId);
    if (agent) agent.toolIds = [first.toolIds.task_status];
    ws.events = [];
    await run(ws, config({ ELEVENLABS_AGENT_ID: first.agentId }));
    expect(ws.writes).toEqual(["update tool tool_2", "update tool tool_3", "update agent agent_4"]);
  });

  it("checks the server with PUBLIC_BASE_URL and VOICE_TOOL_SECRET before any read or write", async () => {
    const ws = new FakeWorkspace();
    await run(ws);
    expect(ws.events[0]).toBe("check https://pledge.example.com secret");
    expect(ws.events.filter((e) => e.startsWith("check"))).toHaveLength(1);
  });

  it("changes nothing when the server check fails", async () => {
    const ws = new FakeWorkspace();
    ws.checkResults = [
      ...PASSING,
      {
        name: "create_task: missing price is rejected",
        ok: false,
        detail: "expected HTTP 400, got 401",
      },
    ];
    const attempt = run(ws);
    await expect(attempt).rejects.toThrow(ProvisionError);
    await expect(attempt).rejects.toThrow(/missing price is rejected: expected HTTP 400, got 401/);
    await expect(attempt).rejects.toThrow(/--skip-server-check/);
    expect(ws.events).toEqual(["check https://pledge.example.com secret"]);
    expect(ws.logs).toContain("  FAIL  create_task: missing price is rejected");
  });

  it("skips the server check with --skip-server-check", async () => {
    const ws = new FakeWorkspace();
    ws.checkResults = [{ name: "server: GET /health answers 200", ok: false, detail: "down" }];
    await run(ws, config({}, { skipServerCheck: true }));
    expect(ws.events.some((e) => e.startsWith("check"))).toBe(false);
    expect(ws.logs[0]).toBe("Server check: skipped (--skip-server-check)");
    expect(ws.agents.size).toBe(1);
  });
});

describe("dry run", () => {
  const dryConfig = (env: Record<string, string> = {}, flags: Flags = {}) =>
    loadProvisionConfig(env, { dryRun: true, createNew: false, ...flags }).config;

  async function dryRun(env: Record<string, string> = {}, flags: Flags = {}) {
    const cfg = dryConfig(env, flags);
    const api = new DryRunApi({ existingAgentId: cfg.agentId });
    const logs: string[] = [];
    await provision(cfg, assets, api, { checkServer: api.checkServer, log: (l) => logs.push(l) });
    return { api, logs, paths: api.calls.map((c) => `${c.method} ${c.path}`) };
  }

  it("records every request of a first run in order, with exact paths", async () => {
    const { paths } = await dryRun({ ELEVENLABS_PHONE_NUMBER_ID: "phnum_1" });
    expect(paths).toEqual([
      "POST /v1/convai/secrets",
      "POST /v1/convai/tools",
      "POST /v1/convai/tools",
      "POST /v1/convai/agents/create",
      "PATCH /v1/convai/phone-numbers/phnum_1",
    ]);
  });

  it("shows the update path with PATCH when ELEVENLABS_AGENT_ID is set", async () => {
    const { paths, logs } = await dryRun({ ELEVENLABS_AGENT_ID: "agent_9" });
    expect(paths).toEqual([
      "PATCH /v1/convai/tools/<tool_id of create_task on agent_9>",
      "PATCH /v1/convai/tools/<tool_id of task_status on agent_9>",
      "PATCH /v1/convai/agents/agent_9",
    ]);
    expect(logs).toContain(`Secret ${SECRET_NAME}: keep <secret_id of ${SECRET_NAME}> unchanged`);
  });

  it("shows PATCH for the secret on the update path with --rotate-secret", async () => {
    const { api, paths, logs } = await dryRun(
      { ELEVENLABS_AGENT_ID: "agent_9", VOICE_TOOL_SECRET: SECRET },
      { rotateSecret: true },
    );
    expect(paths[0]).toBe(`PATCH /v1/convai/secrets/<secret_id of ${SECRET_NAME}>`);
    expect(paths.slice(1)).toEqual([
      "PATCH /v1/convai/tools/<tool_id of create_task on agent_9>",
      "PATCH /v1/convai/tools/<tool_id of task_status on agent_9>",
      "PATCH /v1/convai/agents/agent_9",
    ]);
    expect(api.calls[0]?.body).toEqual({ type: "update", name: SECRET_NAME, value: REDACTED });
    expect(logs).toContain(ROTATE_WARNING);
  });

  it("lists each skipped read with its assumption", async () => {
    const first = await dryRun();
    expect(first.api.skippedReads.join("\n")).toContain("(assumed: no secret with this name)");
    expect(first.api.skippedReads.join("\n")).toContain("(assumed: no unused tool with this name)");
    const update = await dryRun({ ELEVENLABS_AGENT_ID: "agent_9" });
    expect(update.api.skippedReads.join("\n")).toContain(
      "(assumed: the agent exists and has both tools)",
    );
    expect(update.api.skippedReads.join("\n")).toContain(
      "(assumed: the secret exists, because the agent exists)",
    );
  });

  it("plans the server check against PUBLIC_BASE_URL without calling it", async () => {
    const { api } = await dryRun();
    expect(api.plannedServerChecks[0]).toBe(
      "GET http://localhost:8787/health with no secret: expect HTTP 200",
    );
    expect(api.plannedServerChecks).toHaveLength(5);
    const skipped = await dryRun({}, { skipServerCheck: true });
    expect(skipped.api.plannedServerChecks).toEqual([]);
    expect(skipped.logs[0]).toBe("Server check: skipped (--skip-server-check)");
  });

  it("never records the secret value", async () => {
    const { api } = await dryRun({ VOICE_TOOL_SECRET: SECRET });
    expect(JSON.stringify(api.calls)).not.toContain(SECRET);
    expect(api.calls[0]?.body).toEqual({ type: "new", name: SECRET_NAME, value: REDACTED });
  });

  it("links the tools to the secret and the agent to the tools with placeholder ids", async () => {
    const { api } = await dryRun();
    const [, createTask, , agent] = api.calls;
    expect(JSON.stringify(createTask?.body)).toContain(`<secret_id of ${SECRET_NAME}>`);
    expect(JSON.stringify(agent?.body)).toContain("<tool_id of create_task>");
    expect(JSON.stringify(agent?.body)).toContain("<tool_id of task_status>");
  });

  it("fails like a real run on an invalid payload", async () => {
    await expect(dryRun({ ELEVENLABS_LLM: "gpt-99" })).rejects.toThrow(/llm/);
  });
});
