/**
 * Runs the real SDK client against a fake fetch, so no request leaves the process.
 * It proves that the HTTP bodies the SDK sends are exactly the bodies that the dry run prints.
 */
import { describe, expect, it } from "vitest";
import { loadAssets } from "../src/assets.js";
import { loadProvisionConfig } from "../src/config.js";
import { DryRunApi, REDACTED } from "../src/dry-run-api.js";
import { createElevenLabsApi } from "../src/elevenlabs-api.js";
import { provision } from "../src/provision.js";

const assets = loadAssets();
const SECRET = "0123456789abcdef-secret";

interface Sent {
  method: string;
  path: string;
  body: unknown;
  apiKey: string | null;
}

/** Answers like the ElevenLabs API for an empty workspace. */
function fakeElevenLabs() {
  const sent: Sent[] = [];
  let toolCount = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const apiKey = new Headers(init?.headers).get("xi-api-key");
    sent.push({ method, path: url.pathname + url.search, body, apiKey });
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const route = `${method} ${url.pathname}`;
    if (route === "GET /v1/convai/agents") return json({ agents: [], has_more: false });
    if (route === "GET /v1/convai/secrets") return json({ secrets: [] });
    if (route === "POST /v1/convai/secrets")
      return json({ type: "stored", secret_id: "sec_1", name: "x" });
    if (route === "POST /v1/convai/tools") {
      toolCount++;
      return json({
        id: `tool_${toolCount}`,
        tool_config: (body as { tool_config: unknown }).tool_config,
        access_info: {
          is_creator: true,
          creator_name: "Test",
          creator_email: "test@example.com",
          role: "admin",
        },
        usage_stats: { avg_latency_secs: 0 },
      });
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

describe("SDK client", () => {
  it("sends exactly the bodies that the dry run prints", async () => {
    const env = {
      ELEVENLABS_API_KEY: "test-key",
      PUBLIC_BASE_URL: "https://pledge.example.com",
      VOICE_TOOL_SECRET: SECRET,
      ELEVENLABS_PHONE_NUMBER_ID: "phnum_1",
    };
    const real = loadProvisionConfig(env, { dryRun: false, createNew: false }).config;
    const fake = fakeElevenLabs();
    const api = createElevenLabsApi({ apiKey: "test-key", baseUrl: null, fetch: fake.fetchFn });
    const result = await provision(real, assets, api);

    expect(result).toMatchObject({
      secretId: "sec_1",
      agentId: "agent_1",
      toolIds: { create_task: "tool_1", task_status: "tool_2" },
    });
    expect(fake.sent.every((s) => s.apiKey === "test-key")).toBe(true);

    const writes = fake.sent.filter((s) => s.method !== "GET");
    expect(writes.map((s) => `${s.method} ${s.path}`)).toEqual([
      "POST /v1/convai/secrets",
      "POST /v1/convai/tools",
      "POST /v1/convai/tools",
      "POST /v1/convai/agents/create",
      "PATCH /v1/convai/phone-numbers/phnum_1",
    ]);

    // The dry run, with the same ids the fake returned, must print the same requests.
    const dry = new DryRunApi();
    const dryConfig = loadProvisionConfig(env, { dryRun: true, createNew: false }).config;
    await provision(dryConfig, assets, dry);
    const normalize = (v: unknown) =>
      JSON.parse(
        JSON.stringify(v)
          .replaceAll("<secret_id of agent_pledge_voice_tool_secret>", "sec_1")
          .replaceAll("<tool_id of create_task>", "tool_1")
          .replaceAll("<tool_id of task_status>", "tool_2")
          .replaceAll("<agent_id of the new agent>", "agent_1"),
      ) as unknown;
    expect(dry.calls.map((c) => `${c.method} ${c.path}`)).toEqual(
      writes.map((s) => `${s.method} ${s.path}`),
    );
    dry.calls.forEach((call, i) => {
      const sentBody = writes[i]?.body as Record<string, unknown>;
      const expected = normalize(call.body) as Record<string, unknown>;
      if (expected.value === REDACTED) expected.value = SECRET;
      expect(sentBody).toEqual(expected);
    });
  });
});
