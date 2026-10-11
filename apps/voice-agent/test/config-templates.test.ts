import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULTS, loadProvisionConfig } from "../src/config.js";
import { TemplateError, findPlaceholders, renderTemplate } from "../src/templates.js";

const REAL = {
  ELEVENLABS_API_KEY: "key",
  PUBLIC_BASE_URL: "https://pledge.example.com/",
  VOICE_TOOL_SECRET: "0123456789abcdef",
};
const flags = { dryRun: false, createNew: false };

function problems(env: Record<string, string>, f = flags): string[] {
  try {
    loadProvisionConfig(env, f);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  return [];
}

describe("loadProvisionConfig", () => {
  it("reads a complete real configuration and strips the trailing slash", () => {
    const { config, warnings } = loadProvisionConfig(
      { ...REAL, ELEVENLABS_AGENT_ID: " agent_1 " },
      flags,
    );
    expect(config.publicBaseUrl).toBe("https://pledge.example.com");
    expect(config.agentId).toBe("agent_1");
    expect(config.phoneNumberId).toBeNull();
    expect(config.llm).toBe(DEFAULTS.llm);
    expect(warnings).toEqual([]);
  });

  it("requires the key, the base URL, and the secret for a real run", () => {
    expect(problems({})).toEqual([
      "ELEVENLABS_API_KEY is required. Use --dry-run to test without it.",
      "PUBLIC_BASE_URL is required.",
      "VOICE_TOOL_SECRET is required.",
    ]);
  });

  it("requires https for a real run", () => {
    expect(problems({ ...REAL, PUBLIC_BASE_URL: "http://localhost:8787" }).join()).toMatch(
      /must use https/,
    );
  });

  it("rejects a bad URL, a query string, and a short secret", () => {
    expect(problems({ ...REAL, PUBLIC_BASE_URL: "not a url" }).join()).toMatch(/not a valid URL/);
    expect(problems({ ...REAL, PUBLIC_BASE_URL: "https://x.example/?a=1" }).join()).toMatch(
      /query/,
    );
    expect(problems({ ...REAL, VOICE_TOOL_SECRET: "short" }).join()).toMatch(/at least 16/);
  });

  it("rejects --create-new together with ELEVENLABS_AGENT_ID", () => {
    expect(
      problems({ ...REAL, ELEVENLABS_AGENT_ID: "a" }, { dryRun: false, createNew: true }).join(),
    ).toMatch(/--create-new/);
  });

  it("runs a dry run with no environment at all, using the mock server URL", () => {
    const { config, warnings } = loadProvisionConfig({}, { dryRun: true, createNew: false });
    expect(config.apiKey).toBeNull();
    expect(config.publicBaseUrl).toBe(DEFAULTS.dryRunPublicBaseUrl);
    expect(config.voiceToolSecret).toBe(DEFAULTS.dryRunSecret);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("allows http in a dry run with a warning", () => {
    const { warnings } = loadProvisionConfig(
      { PUBLIC_BASE_URL: "http://localhost:9999" },
      { dryRun: true, createNew: false },
    );
    expect(warnings.join()).toMatch(/requires https/);
  });
});

describe("templates", () => {
  const template = {
    url: "${BASE}/tools/{task_id}",
    list: ["${BASE}", 3, null],
    nested: { s: "${SECRET}" },
  };

  it("finds ${NAME} placeholders but not ElevenLabs {path} parameters", () => {
    expect(findPlaceholders(template)).toEqual(["BASE", "SECRET"]);
  });

  it("replaces every placeholder and keeps other values", () => {
    expect(renderTemplate(template, { BASE: "https://x", SECRET: "s" })).toEqual({
      url: "https://x/tools/{task_id}",
      list: ["https://x", 3, null],
      nested: { s: "s" },
    });
  });

  it("does not change the input", () => {
    const copy = structuredClone(template);
    renderTemplate(template, { BASE: "https://x", SECRET: "s" });
    expect(template).toEqual(copy);
  });

  it("fails on a missing or an unused variable", () => {
    expect(() => renderTemplate(template, { BASE: "x" })).toThrow(TemplateError);
    expect(() => renderTemplate(template, { BASE: "x", SECRET: "s", EXTRA: "e" })).toThrow(/EXTRA/);
  });
});
