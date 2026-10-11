/**
 * Pure functions that build the exact JSON bodies for the ElevenLabs API.
 * No network and no environment access here, so everything is unit tested.
 */
import type * as wire from "@elevenlabs/elevenlabs-js/serialization/index.js";
import type { ProvisionConfig } from "./config.js";
import type { ToolName } from "./assets.js";
import { renderTemplate } from "./templates.js";
import {
  assertToolWire,
  type AgentCreateWire,
  type AgentUpdateWire,
  type PhoneNumberUpdateWire,
  type SecretCreateWire,
  type SecretUpdateWire,
  type ToolWire,
} from "./sdk-payloads.js";

/** Name of the ElevenLabs workspace secret that holds VOICE_TOOL_SECRET. */
export const SECRET_NAME = "agent_pledge_voice_tool_secret";

export const AGENT_TAGS = ["agent-pledge"];

/** Words that speech recognition should expect on a Berkeley demo call. */
export const ASR_KEYWORDS = ["Agent Pledge", "Main Stacks", "Moffitt", "Doe Library", "Yik Yak"];

/** Voice settings for a loud room on speakerphone: steady and a little slower than normal. */
export const VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.8, speed: 0.95 } as const;

/**
 * A demo call takes about one minute. This caps cost if a call gets stuck.
 * Eight minutes leaves room for T9 in TESTING.md, where the caller stays on the line and asks for the status.
 */
export const MAX_CALL_SECONDS = 480;

/** What the agent says when the call reaches MAX_CALL_SECONDS, so the call does not end in silence. */
export const MAX_CALL_MESSAGE =
  "Sorry, this call has reached its time limit. Please call again if you need anything else.";

export function buildSecretCreatePayload(value: string): SecretCreateWire {
  return { type: "new", name: SECRET_NAME, value };
}

export function buildSecretUpdatePayload(value: string): SecretUpdateWire {
  return { type: "update", name: SECRET_NAME, value };
}

export interface ToolVars {
  publicBaseUrl: string;
  secretId: string;
}

/** Fills a tool template from tools/*.json and checks it against the SDK schema. */
export function buildToolPayload(name: ToolName, template: unknown, vars: ToolVars): ToolWire {
  const rendered = renderTemplate(template, {
    PUBLIC_BASE_URL: vars.publicBaseUrl,
    VOICE_TOOL_SECRET_ID: vars.secretId,
  });
  const tool = assertToolWire(rendered, `Tool ${name}`);
  if (tool.tool_config.type !== "webhook" || tool.tool_config.name !== name) {
    throw new Error(`tools/${name}.json must define a webhook tool named ${name}.`);
  }
  return tool;
}

export interface AgentInput {
  config: Pick<ProvisionConfig, "agentName" | "voiceId" | "ttsModelId" | "llm">;
  systemPrompt: string;
  firstMessage: string;
  toolIds: string[];
}

function conversationConfig(input: AgentInput) {
  const { config } = input;
  return {
    agent: {
      first_message: input.firstMessage,
      language: "en",
      // A noisy room must not cut off the greeting.
      disable_first_message_interruptions: true,
      max_conversation_duration_message: MAX_CALL_MESSAGE,
      prompt: {
        prompt: input.systemPrompt,
        // Env strings; the strict SDK parse in sdk-payloads.ts rejects unknown values.
        llm: config.llm as wire.Llm.Raw,
        temperature: 0,
        tool_ids: input.toolIds,
        built_in_tools: {
          end_call: {
            type: "system",
            name: "end_call",
            description: "",
            params: { system_tool_type: "end_call" },
          },
        },
      },
    },
    asr: { keywords: ASR_KEYWORDS },
    tts: {
      model_id: config.ttsModelId as wire.TtsConversationalModel.Raw,
      voice_id: config.voiceId,
      ...VOICE_SETTINGS,
    },
    conversation: { max_duration_seconds: MAX_CALL_SECONDS },
  } as const;
}

export function buildAgentCreatePayload(input: AgentInput): AgentCreateWire {
  return {
    name: input.config.agentName,
    tags: AGENT_TAGS,
    conversation_config: conversationConfig(input),
  };
}

export function buildAgentUpdatePayload(input: AgentInput): AgentUpdateWire {
  return {
    name: input.config.agentName,
    tags: AGENT_TAGS,
    conversation_config: conversationConfig(input),
  };
}

export function buildPhoneNumberUpdatePayload(agentId: string): PhoneNumberUpdateWire {
  return { agent_id: agentId };
}
