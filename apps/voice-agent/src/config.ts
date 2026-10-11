/**
 * Provisioning settings, read from environment variables.
 * See apps/voice-agent/.env.example for every variable.
 */

export const DEFAULTS = {
  agentName: "Agent Pledge",
  /** The ElevenLabs API default voice. Pick a voice that is clear on speakerphone (issue 11). */
  voiceId: "cjVigY5qzO86Huf0OWal",
  /** The ElevenLabs API default TTS model for agents. */
  ttsModelId: "eleven_v4_turbo",
  /** The ElevenLabs API default LLM for agents: fast, with reliable tool calls. */
  llm: "gemini-2.5-flash",
  /** The dry run points the tools at the local mock server when PUBLIC_BASE_URL is not set. */
  dryRunPublicBaseUrl: "http://localhost:8787",
  dryRunSecret: "<VOICE_TOOL_SECRET is not set>",
} as const;

export const MIN_SECRET_LENGTH = 16;

export interface ProvisionConfig {
  dryRun: boolean;
  /** Create a new agent even if one with the same name exists. */
  createNew: boolean;
  /** Replace the value of the workspace secret if it exists. Every agent in the workspace that uses it is affected. */
  rotateSecret: boolean;
  /** Do not check the server at PUBLIC_BASE_URL before the first write. */
  skipServerCheck: boolean;
  apiKey: string | null;
  /** Optional API base URL, for example a regional ElevenLabs endpoint. */
  apiBaseUrl: string | null;
  agentId: string | null;
  phoneNumberId: string | null;
  /** Public base URL of the server, without a trailing slash. */
  publicBaseUrl: string;
  voiceToolSecret: string;
  agentName: string;
  voiceId: string;
  ttsModelId: string;
  llm: string;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function normalizeBaseUrl(raw: string, requireHttps: boolean, problems: string[]): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    problems.push(`PUBLIC_BASE_URL is not a valid URL: ${raw}`);
    return raw;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    problems.push(`PUBLIC_BASE_URL must use http or https: ${raw}`);
  } else if (requireHttps && url.protocol !== "https:") {
    problems.push(
      "PUBLIC_BASE_URL must use https, because ElevenLabs calls it from the internet. Use a tunnel for a local server.",
    );
  }
  if (url.search || url.hash) problems.push("PUBLIC_BASE_URL must not have a query or a fragment.");
  return url.toString().replace(/\/+$/, "");
}

export interface ConfigResult {
  config: ProvisionConfig;
  /** Problems that do not stop a dry run. */
  warnings: string[];
}

export interface ProvisionFlags {
  dryRun: boolean;
  createNew: boolean;
  rotateSecret?: boolean;
  skipServerCheck?: boolean;
}

export function loadProvisionConfig(env: Env, flags: ProvisionFlags): ConfigResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const { dryRun } = flags;

  const need = (name: string, fallback: string): string => {
    const value = read(env, name);
    if (value) return value;
    if (dryRun) {
      warnings.push(`${name} is not set; the dry run uses ${JSON.stringify(fallback)}.`);
      return fallback;
    }
    problems.push(`${name} is required.`);
    return fallback;
  };

  const apiKey = read(env, "ELEVENLABS_API_KEY");
  if (!apiKey && !dryRun)
    problems.push("ELEVENLABS_API_KEY is required. Use --dry-run to test without it.");

  const rawBaseUrl = read(env, "PUBLIC_BASE_URL");
  const publicBaseUrl = rawBaseUrl
    ? normalizeBaseUrl(rawBaseUrl, !dryRun, problems)
    : need("PUBLIC_BASE_URL", DEFAULTS.dryRunPublicBaseUrl);

  const voiceToolSecret = need("VOICE_TOOL_SECRET", DEFAULTS.dryRunSecret);
  if (read(env, "VOICE_TOOL_SECRET") && voiceToolSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`VOICE_TOOL_SECRET must have at least ${MIN_SECRET_LENGTH} characters.`);
  }

  const apiBaseUrl = read(env, "ELEVENLABS_BASE_URL");
  if (apiBaseUrl) {
    try {
      new URL(apiBaseUrl);
    } catch {
      problems.push(`ELEVENLABS_BASE_URL is not a valid URL: ${apiBaseUrl}`);
    }
  }

  const agentId = read(env, "ELEVENLABS_AGENT_ID");
  if (agentId && flags.createNew)
    problems.push("Do not combine --create-new with ELEVENLABS_AGENT_ID.");

  if (dryRun && publicBaseUrl.startsWith("http:")) {
    warnings.push("PUBLIC_BASE_URL uses http. A real provision run requires https.");
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    config: {
      dryRun,
      createNew: flags.createNew,
      rotateSecret: flags.rotateSecret ?? false,
      skipServerCheck: flags.skipServerCheck ?? false,
      apiKey,
      apiBaseUrl,
      agentId,
      phoneNumberId: read(env, "ELEVENLABS_PHONE_NUMBER_ID"),
      publicBaseUrl,
      voiceToolSecret,
      agentName: read(env, "ELEVENLABS_AGENT_NAME") ?? DEFAULTS.agentName,
      voiceId: read(env, "ELEVENLABS_VOICE_ID") ?? DEFAULTS.voiceId,
      ttsModelId: read(env, "ELEVENLABS_TTS_MODEL") ?? DEFAULTS.ttsModelId,
      llm: read(env, "ELEVENLABS_LLM") ?? DEFAULTS.llm,
    },
    warnings,
  };
}
