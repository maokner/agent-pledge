/**
 * Runs the real SDK client against a fake fetch, so no request leaves the process.
 * It proves that the HTTP requests the SDK sends are exactly the requests that the dry run prints,
 * on the first run (POST) and on the update path (PATCH).
 */
import { describe, expect, it } from "vitest";
import { loadAssets } from "../src/assets.js";
import { loadProvisionConfig, type ProvisionFlags } from "../src/config.js";
import { DryRunApi, REDACTED } from "../src/dry-run-api.js";
import { createElevenLabsApi } from "../src/elevenlabs-api.js";
import { SECRET_NAME } from "../src/payloads.js";
import { provision } from "../src/provision.js";

const assets = loadAssets();
const SECRET = "0123456789abcdef-secret";
const passingCheck = async () => [];

interface Sent {
  method: string;
  path: string;
  body: unknown;
  apiKey: string | null;
}

interface FakeState {
  /** The agent that exists, with both tools attached, and the secret. Null for an empty workspace. */
  existing: { agentId: string; toolIds: [string, string]; secretId: string } | null;
  /** Webhook tools that a list call returns, by name. */
  listedTools: { id: string; name: string; dependentAgents: number }[];
}

const TOOL_NAMES_BY_ID = ["create_task", "task_status"];

/** Answers like the ElevenLabs API. */
function fakeElevenLabs(state: FakeState) {
  const sent: Sent[] = [];
  let toolCount = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const apiKey = new Headers(init?.headers).get("xi-api-key");
    sent.push({ method, path: url.pathname + url.search, body, apiKey });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });
    const tool = (id: string, toolConfig: unknown) => ({
      id,
      tool_config: toolConfig,
      access_info: {
        is_creator: true,
        creator_name: "Test",
        creator_email: "test@example.com",
        role: "admin",
      },
      usage_stats: { avg_latency_secs: 0 },
    });
    const webhook = (name: string) => ({
      type: "webhook",
      name,
      description: name,
      api_schema: { url: "https://old.example.com", method: "GET" },
    });
    const agent = (agentId: string, toolIds: string[]) => ({
      agent_id: agentId,
      name: "Agent Pledge",
      conversation_config: { agent: { prompt: { tool_ids: toolIds } } },
      metadata: { created_at_unix_secs: 0, updated_at_unix_secs: 0 },
    });
    const ex = state.existing;

    const route = `${method} ${url.pathname}`;
    if (route === "GET /v1/convai/agents") return json({ agents: [], has_more: false });
    if (route === "GET /v1/convai/secrets") {
      return json({
        secrets: ex
          ? [
              {
                type: "stored",
                secret_id: ex.secretId,
                name: SECRET_NAME,
                used_by: { tools: [], agents: [], others: [] },
              },
            ]
          : [],
      });
    }
    if (route === "POST /v1/convai/secrets")
      return json({ type: "stored", secret_id: "sec_1", name: SECRET_NAME });
    if (ex && route === `PATCH /v1/convai/secrets/${ex.secretId}`)
      return json({ type: "stored", secret_id: ex.secretId, name: SECRET_NAME });
    if (ex && route === `GET /v1/convai/agents/${ex.agentId}`)
      return json(agent(ex.agentId, ex.toolIds));
    if (route.startsWith("GET /v1/convai/agents/")) return json({ detail: "agent not found" }, 404);
    if (ex && route === `PATCH /v1/convai/agents/${ex.agentId}`)
      return json(agent(ex.agentId, ex.toolIds));
    if (route === "GET /v1/convai/tools") {
      const name = url.searchParams.get("search");
      const tools = state.listedTools.filter((t) => name !== null && t.name.startsWith(name));
      return json({ tools: tools.map((t) => tool(t.id, webhook(t.name))), has_more: false });
    }
    const dependents = /^GET \/v1\/convai\/tools\/([^/]+)\/dependent-agents$/.exec(route);
    if (dependents) {
      const t = state.listedTools.find((x) => x.id === dependents[1]);
      const agents = Array.from({ length: t?.dependentAgents ?? 0 }, (_, i) => ({
        type: "unknown",
        id: `agent_${i}`,
      }));
      return json({ agents, has_more: false });
    }
    const toolRoute = /^(GET|PATCH) \/v1\/convai\/tools\/([^/]+)$/.exec(route);
    const knownToolIds = [...(ex?.toolIds ?? []), ...state.listedTools.map((t) => t.id)];
    if (toolRoute && knownToolIds.includes(toolRoute[2] as string)) {
      const id = toolRoute[2] as string;
      const name =
        state.listedTools.find((t) => t.id === id)?.name ??
        (TOOL_NAMES_BY_ID[ex?.toolIds.indexOf(id) ?? -1] as string);
      const config =
        toolRoute[1] === "PATCH" ? (body as { tool_config: unknown }).tool_config : webhook(name);
      return json(tool(id, config));
    }
    if (route === "POST /v1/convai/tools") {
      toolCount++;
      return json(tool(`tool_${toolCount}`, (body as { tool_config: unknown }).tool_config));
    }
    if (route === "POST /v1/convai/agents/create") return json({ agent_id: "agent_1" });
    if (route === "PATCH /v1/convai/phone-numbers/phnum_1") {
      return json({
        provider: "twilio",
        phone_number: "+15105550100",
        label: "Demo",
        phone_number_id: "phnum_1",
      });
    }
    return new Response(JSON.stringify({ detail: `no fake for ${route}` }), { status: 500 });
  }) as typeof fetch;
  return { sent, fetchFn };
}

const BASE_ENV = {
  ELEVENLABS_API_KEY: "test-key",
  PUBLIC_BASE_URL: "https://pledge.example.com",
  VOICE_TOOL_SECRET: SECRET,
};

/** Runs the real client against the fake, then the dry run, and returns both sets of writes. */
async function realAndDry(
  state: FakeState,
  env: Record<string, string>,
  flags: Omit<ProvisionFlags, "dryRun"> = { createNew: false },
  ids: Record<string, string> = {},
) {
  const fullEnv = { ...BASE_ENV, ...env };
  const real = loadProvisionConfig(fullEnv, { ...flags, dryRun: false }).config;
  const fake = fakeElevenLabs(state);
  const api = createElevenLabsApi({ apiKey: "test-key", baseUrl: null, fetch: fake.fetchFn });
  const result = await provision(real, assets, api, { checkServer: passingCheck });

  const dryConfig = loadProvisionConfig(fullEnv, { ...flags, dryRun: true }).config;
  const dry = new DryRunApi({ existingAgentId: dryConfig.agentId });
  await provision(dryConfig, assets, dry, { checkServer: dry.checkServer });

  const normalize = (v: unknown) => {
    let text = JSON.stringify(v);
    for (const [placeholder, id] of Object.entries(ids)) text = text.replaceAll(placeholder, id);
    return JSON.parse(text) as unknown;
  };
  const writes = fake.sent.filter((s) => s.method !== "GET");
  return {
    result,
    sent: fake.sent,
    writes,
    dryWrites: dry.calls.map((c) => {
      const body = normalize(c.body) as Record<string, unknown>;
      if (body.value === REDACTED) body.value = SECRET;
      return { method: c.method, path: normalize(c.path) as string, body };
    }),
  };
}

describe("SDK client", () => {
  it("sends exactly the requests that the dry run prints, on the first run", async () => {
    const { result, sent, writes, dryWrites } = await realAndDry(
      { existing: null, listedTools: [] },
      { ELEVENLABS_PHONE_NUMBER_ID: "phnum_1" },
      { createNew: false },
      {
        [`<secret_id of ${SECRET_NAME}>`]: "sec_1",
        "<tool_id of create_task>": "tool_1",
        "<tool_id of task_status>": "tool_2",
        "<agent_id of the new agent>": "agent_1",
      },
    );
    expect(result).toMatchObject({
      secretId: "sec_1",
      agentId: "agent_1",
      toolIds: { create_task: "tool_1", task_status: "tool_2" },
    });
    expect(sent.every((s) => s.apiKey === "test-key")).toBe(true);
    expect(writes.map((s) => `${s.method} ${s.path}`)).toEqual([
      "POST /v1/convai/secrets",
      "POST /v1/convai/tools",
      "POST /v1/convai/tools",
      "POST /v1/convai/agents/create",
      "PATCH /v1/convai/phone-numbers/phnum_1",
    ]);
    expect(dryWrites).toEqual(writes.map(({ method, path, body }) => ({ method, path, body })));
  });

  it("sends exactly the PATCH requests that the dry run prints, on the update path", async () => {
    const existing = {
      agentId: "agent_7",
      toolIds: ["tool_c", "tool_s"] as [string, string],
      secretId: "sec_7",
    };
    const { result, writes, dryWrites } = await realAndDry(
      { existing, listedTools: [] },
      { ELEVENLABS_AGENT_ID: "agent_7" },
      { createNew: false, rotateSecret: true },
      {
        [`<secret_id of ${SECRET_NAME}>`]: "sec_7",
        "<tool_id of create_task on agent_7>": "tool_c",
        "<tool_id of task_status on agent_7>": "tool_s",
      },
    );
    expect(result).toMatchObject({ secretId: "sec_7", agentId: "agent_7", agentCreated: false });
    expect(writes.map((s) => `${s.method} ${s.path}`)).toEqual([
      "PATCH /v1/convai/secrets/sec_7",
      "PATCH /v1/convai/tools/tool_c",
      "PATCH /v1/convai/tools/tool_s",
      "PATCH /v1/convai/agents/agent_7",
    ]);
    expect(dryWrites).toEqual(writes.map(({ method, path, body }) => ({ method, path, body })));
  });

  it("reuses an unused tool with the exact name, and never one that an agent uses", async () => {
    const { result, writes } = await realAndDry(
      {
        existing: null,
        listedTools: [
          { id: "tool_used", name: "create_task", dependentAgents: 1 },
          { id: "tool_orphan", name: "create_task", dependentAgents: 0 },
          { id: "tool_prefix", name: "create_task_v2", dependentAgents: 0 },
        ],
      },
      {},
    );
    expect(result.toolIds.create_task).toBe("tool_orphan");
    expect(writes.map((s) => `${s.method} ${s.path}`)).toEqual([
      "POST /v1/convai/secrets",
      "PATCH /v1/convai/tools/tool_orphan",
      "POST /v1/convai/tools",
      "POST /v1/convai/agents/create",
    ]);
  });

  it("turns a 404 for ELEVENLABS_AGENT_ID into a clear error before any write", async () => {
    const fake = fakeElevenLabs({ existing: null, listedTools: [] });
    const api = createElevenLabsApi({ apiKey: "test-key", baseUrl: null, fetch: fake.fetchFn });
    const cfg = loadProvisionConfig(
      { ...BASE_ENV, ELEVENLABS_AGENT_ID: "agent_gone" },
      { dryRun: false, createNew: false },
    ).config;
    await expect(provision(cfg, assets, api, { checkServer: passingCheck })).rejects.toThrow(
      /Unset ELEVENLABS_AGENT_ID/,
    );
    expect(fake.sent.filter((s) => s.method !== "GET")).toEqual([]);
  });
});
