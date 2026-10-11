import { describe, expect, it } from "vitest";
import type { CreateTaskInput } from "@agent-pledge/shared";
import { loadAssets, TOOL_NAMES } from "../src/assets.js";
import { CREATE_TASK_PATH, TASK_STATUS_PATH_PREFIX, VOICE_SECRET_HEADER } from "../src/contract.js";
import {
  MAX_CALL_MESSAGE,
  MAX_CALL_SECONDS,
  SECRET_NAME,
  buildAgentCreatePayload,
  buildAgentUpdatePayload,
  buildPhoneNumberUpdatePayload,
  buildSecretCreatePayload,
  buildSecretUpdatePayload,
  buildToolPayload,
} from "../src/payloads.js";
import { PayloadError, toSdk } from "../src/sdk-payloads.js";
import { DEFAULTS } from "../src/config.js";
import { findPlaceholders } from "../src/templates.js";

const assets = loadAssets();
const vars = { publicBaseUrl: "https://pledge.example.com", secretId: "sec_123" };

/** Every key of CreateTaskInput. The Record type makes this fail to compile if the shared type changes. */
const CREATE_TASK_KEYS = Object.keys({
  description: true,
  place: true,
  time_limit_minutes: true,
  price_usd: true,
  caller_phone: true,
  call_id: true,
} satisfies Record<keyof CreateTaskInput, true>);

function webhook(name: (typeof TOOL_NAMES)[number]) {
  const tool = buildToolPayload(name, assets.toolTemplates[name], vars).tool_config;
  if (tool.type !== "webhook") throw new Error("not a webhook");
  return tool;
}

describe("tool templates", () => {
  it.each(TOOL_NAMES)(
    "%s uses exactly the PUBLIC_BASE_URL and VOICE_TOOL_SECRET_ID placeholders",
    (name) => {
      expect(findPlaceholders(assets.toolTemplates[name]).sort()).toEqual([
        "PUBLIC_BASE_URL",
        "VOICE_TOOL_SECRET_ID",
      ]);
    },
  );

  it.each(TOOL_NAMES)("%s renders with no placeholder left", (name) => {
    const json = JSON.stringify(buildToolPayload(name, assets.toolTemplates[name], vars));
    expect(json).not.toContain("${");
  });

  it.each(TOOL_NAMES)("%s sends the secret header from the workspace secret store", (name) => {
    expect(webhook(name).api_schema.request_headers).toEqual({
      [VOICE_SECRET_HEADER]: { secret_id: "sec_123" },
    });
  });

  it.each(TOOL_NAMES)("%s has a timeout that ElevenLabs accepts (5 to 300 seconds)", (name) => {
    const timeout = webhook(name).response_timeout_secs ?? 20;
    expect(timeout).toBeGreaterThanOrEqual(5);
    expect(timeout).toBeLessThanOrEqual(300);
  });

  it("rejects a template whose tool name does not match its file", () => {
    expect(() => buildToolPayload("task_status", assets.toolTemplates.create_task, vars)).toThrow(
      /webhook tool named task_status/,
    );
  });
});

describe("create_task tool", () => {
  const tool = webhook("create_task");
  const body = tool.api_schema.request_body_schema;
  const props = (body?.properties ?? {}) as Record<string, Record<string, unknown>>;

  it("POSTs to PUBLIC_BASE_URL + /tools/create_task", () => {
    expect(tool.api_schema.method).toBe("POST");
    expect(tool.api_schema.url).toBe(`https://pledge.example.com${CREATE_TASK_PATH}`);
  });

  it("has exactly the CreateTaskInput fields, all required because ElevenLabs always fills them", () => {
    expect(Object.keys(props).sort()).toEqual([...CREATE_TASK_KEYS].sort());
    expect([...(body?.required ?? [])].sort()).toEqual([...CREATE_TASK_KEYS].sort());
  });

  it("fills caller_phone from the caller ID, never from the conversation", () => {
    expect(props.caller_phone).toEqual({ type: "string", dynamic_variable: "system__caller_id" });
  });

  it("fills call_id from the conversation id, so the server can dedupe a retry", () => {
    expect(props.call_id).toEqual({
      type: "string",
      dynamic_variable: "system__conversation_id",
    });
  });

  it("lets the LLM fill the other four fields from the conversation", () => {
    for (const key of ["description", "place", "time_limit_minutes", "price_usd"]) {
      expect(props[key]?.description, key).toBeTruthy();
      expect(props[key]?.dynamic_variable, key).toBeUndefined();
      expect(props[key]?.constant_value, key).toBeUndefined();
    }
  });

  it("uses JSON number types for the time limit and the price", () => {
    expect(props.time_limit_minutes?.type).toBe("integer");
    expect(props.price_usd?.type).toBe("number");
    expect(props.description?.type).toBe("string");
    expect(props.place?.type).toBe("string");
  });

  it("tells the LLM to keep add-ons out of the description", () => {
    expect(props.description?.description).toMatch(/only the seat hold/i);
    expect(props.description?.description).toMatch(/add-on/);
  });

  it("tells the LLM never to guess the price", () => {
    expect(props.price_usd?.description).toMatch(/never guess/i);
  });

  it("cannot be interrupted while it runs and while the agent reads the PIN", () => {
    expect(tool.interruption_mode).toBe("disable_during_tool_and_turn");
  });
});

describe("task_status tool", () => {
  const tool = webhook("task_status");

  it("GETs PUBLIC_BASE_URL + /tools/task_status/{task_id}", () => {
    expect(tool.api_schema.method).toBe("GET");
    expect(tool.api_schema.url).toBe(
      `https://pledge.example.com${TASK_STATUS_PATH_PREFIX}{task_id}`,
    );
  });

  it("defines the task_id path parameter for the URL placeholder", () => {
    expect(Object.keys(tool.api_schema.path_params_schema ?? {})).toEqual(["task_id"]);
    expect(tool.api_schema.path_params_schema?.task_id?.type).toBe("string");
    expect(tool.api_schema.request_body_schema).toBeUndefined();
  });
});

describe("agent payload", () => {
  const input = {
    config: {
      agentName: "Agent Pledge",
      voiceId: "voice_1",
      ttsModelId: DEFAULTS.ttsModelId,
      llm: DEFAULTS.llm,
    },
    systemPrompt: assets.systemPrompt,
    firstMessage: assets.firstMessage,
    toolIds: ["tool_create", "tool_status"],
  };

  it("uploads the prompt file, the first message file, and the tool ids", () => {
    const agent = buildAgentCreatePayload(input).conversation_config.agent;
    expect(agent?.prompt?.prompt).toBe(assets.systemPrompt);
    expect(agent?.first_message).toBe(assets.firstMessage);
    expect(agent?.prompt?.tool_ids).toEqual(["tool_create", "tool_status"]);
    expect(agent?.prompt?.built_in_tools?.end_call?.params).toEqual({
      system_tool_type: "end_call",
    });
    expect(agent?.language).toBe("en");
  });

  it("sets the voice", () => {
    const tts = buildAgentCreatePayload(input).conversation_config.tts;
    expect(tts?.voice_id).toBe("voice_1");
    expect(tts?.model_id).toBe(DEFAULTS.ttsModelId);
  });

  it("says goodbye at the duration limit instead of ending the call in silence", () => {
    const config = buildAgentCreatePayload(input).conversation_config;
    expect(config.conversation?.max_duration_seconds).toBe(MAX_CALL_SECONDS);
    expect(MAX_CALL_SECONDS).toBeGreaterThanOrEqual(5 * 60);
    expect(config.agent?.max_conversation_duration_message).toBe(MAX_CALL_MESSAGE);
    expect(MAX_CALL_MESSAGE).not.toMatch(/\d/);
    expect(MAX_CALL_MESSAGE.split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it("sends the same settings on create and on update", () => {
    const created = buildAgentCreatePayload(input);
    const updated = buildAgentUpdatePayload(input);
    expect(updated).toEqual(created);
  });
});

describe("small payloads", () => {
  it("builds the secret payloads", () => {
    expect(buildSecretCreatePayload("v")).toEqual({ type: "new", name: SECRET_NAME, value: "v" });
    expect(buildSecretUpdatePayload("v")).toEqual({
      type: "update",
      name: SECRET_NAME,
      value: "v",
    });
  });

  it("builds the phone number payload", () => {
    expect(buildPhoneNumberUpdatePayload("agent_1")).toEqual({ agent_id: "agent_1" });
  });
});

describe("SDK schema check", () => {
  const agentInput = {
    config: {
      agentName: "A",
      voiceId: DEFAULTS.voiceId,
      ttsModelId: DEFAULTS.ttsModelId,
      llm: DEFAULTS.llm,
    },
    systemPrompt: "p",
    firstMessage: "f",
    toolIds: ["t"],
  };

  it("accepts every payload unchanged", () => {
    for (const name of TOOL_NAMES) {
      const sdk = toSdk.tool(buildToolPayload(name, assets.toolTemplates[name], vars));
      expect(sdk.toolConfig.type).toBe("webhook");
    }
    expect(toSdk.agentCreate(buildAgentCreatePayload(agentInput)).name).toBe("A");
    expect(toSdk.agentUpdate(buildAgentUpdatePayload(agentInput)).name).toBe("A");
    expect(toSdk.phoneNumberUpdate(buildPhoneNumberUpdatePayload("a")).agentId).toBe("a");
    expect(toSdk.secretCreate(buildSecretCreatePayload("v"))).toEqual({
      name: SECRET_NAME,
      value: "v",
    });
    expect(toSdk.secretUpdate(buildSecretUpdatePayload("v"))).toEqual({
      name: SECRET_NAME,
      value: "v",
    });
  });

  it("converts snake_case wire fields to the SDK's camelCase fields", () => {
    const sdk = toSdk.tool(buildToolPayload("create_task", assets.toolTemplates.create_task, vars));
    expect(JSON.stringify(sdk)).toContain('"dynamicVariable":"system__caller_id"');
    expect(JSON.stringify(sdk)).toContain('"dynamicVariable":"system__conversation_id"');
    expect(JSON.stringify(sdk)).toContain('"secretId":"sec_123"');
  });

  it("rejects an unknown key instead of dropping it", () => {
    const tool = buildToolPayload("create_task", assets.toolTemplates.create_task, vars);
    const bad = {
      tool_config: { ...tool.tool_config, response_timeout_seconds: 30 },
    } as unknown as typeof tool;
    expect(() => toSdk.tool(bad)).toThrow(PayloadError);
    expect(() => toSdk.tool(bad)).toThrow(/response_timeout_seconds/);
  });

  it("rejects an unknown LLM or TTS model", () => {
    const badLlm = { ...agentInput, config: { ...agentInput.config, llm: "gpt-99" } };
    expect(() => toSdk.agentCreate(buildAgentCreatePayload(badLlm))).toThrow(/llm/);
    const badTts = { ...agentInput, config: { ...agentInput.config, ttsModelId: "eleven_v9" } };
    expect(() => toSdk.agentUpdate(buildAgentUpdatePayload(badTts))).toThrow(/model_id/);
  });

  it("rejects a secret payload with the wrong type", () => {
    const bad = { ...buildSecretCreatePayload("v"), type: "update" } as unknown as Parameters<
      typeof toSdk.secretCreate
    >[0];
    expect(() => toSdk.secretCreate(bad)).toThrow(/type must be "new"/);
  });
});
