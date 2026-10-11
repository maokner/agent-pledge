/**
 * Checks wire-format payloads (the exact JSON the ElevenLabs API receives) against the official SDK schemas,
 * and converts them to the SDK's request objects.
 *
 * The SDK serializes camelCase objects to snake_case JSON and silently drops unknown keys.
 * To make sure the dry run prints exactly what is sent, every conversion:
 *   1. parses the wire JSON with unknown keys, enum values, and union members all rejected, and
 *   2. serializes the result back and requires it to equal the input.
 */
import { isDeepStrictEqual } from "node:util";
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";
import * as schemas from "@elevenlabs/elevenlabs-js/serialization/index.js";
import type * as wire from "@elevenlabs/elevenlabs-js/serialization/index.js";

export type ToolWire = wire.ToolRequestModel.Raw;
export type AgentCreateWire = wire.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost.Raw;
export type AgentUpdateWire = wire.conversationalAi.UpdateAgentRequest.Raw;
export type PhoneNumberUpdateWire = wire.conversationalAi.UpdatePhoneNumberRequest.Raw;
/** The SDK adds the "type" field itself, so its schema covers only name and value. */
export type SecretCreateWire = {
  type: "new";
} & wire.conversationalAi.PostWorkspaceSecretRequest.Raw;
export type SecretUpdateWire = {
  type: "update";
} & wire.conversationalAi.PatchWorkspaceSecretRequest.Raw;

interface MaybeValid<T> {
  ok: boolean;
  value?: T;
  errors?: { path: string[]; message: string }[];
}

interface WireSchema<Raw, Parsed> {
  parse(raw: unknown, opts?: object): MaybeValid<Parsed>;
  json(parsed: unknown, opts?: object): MaybeValid<Raw>;
}

const STRICT = {
  unrecognizedObjectKeys: "fail",
  allowUnrecognizedUnionMembers: false,
  allowUnrecognizedEnumValues: false,
  skipValidation: false,
} as const;

export class PayloadError extends Error {
  constructor(
    readonly label: string,
    readonly problems: string[],
  ) {
    super(
      `${label} payload is not valid for the ElevenLabs API:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    this.name = "PayloadError";
  }
}

function convert<Raw, Parsed>(
  schema: WireSchema<Raw, Parsed>,
  payload: unknown,
  label: string,
): Parsed {
  const parsed = schema.parse(payload, STRICT);
  if (!parsed.ok) {
    throw new PayloadError(
      label,
      (parsed.errors ?? []).map(
        (e) => `${e.path.length ? `${e.path.join(".")}: ` : ""}${e.message}`,
      ),
    );
  }
  const back = schema.json(parsed.value, STRICT);
  if (!back.ok || !isDeepStrictEqual(back.value, payload)) {
    throw new PayloadError(label, ["the SDK would change or drop part of this payload"]);
  }
  return parsed.value as Parsed;
}

/** Validates an untyped value, for example a JSON template, as a tool payload. */
export function assertToolWire(payload: unknown, label = "Tool"): ToolWire {
  convert(schemas.ToolRequestModel, payload, label);
  return payload as ToolWire;
}

export const toSdk = {
  tool: (payload: ToolWire): ElevenLabs.ToolRequestModel =>
    convert(schemas.ToolRequestModel, payload, "Tool"),

  agentCreate: (
    payload: AgentCreateWire,
  ): ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost =>
    convert(
      schemas.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost,
      payload,
      "Create agent",
    ),

  agentUpdate: (payload: AgentUpdateWire): ElevenLabs.conversationalAi.UpdateAgentRequest =>
    convert(schemas.conversationalAi.UpdateAgentRequest, payload, "Update agent"),

  phoneNumberUpdate: (
    payload: PhoneNumberUpdateWire,
  ): ElevenLabs.conversationalAi.UpdatePhoneNumberRequest =>
    convert(schemas.conversationalAi.UpdatePhoneNumberRequest, payload, "Update phone number"),

  secretCreate: ({
    type,
    ...rest
  }: SecretCreateWire): ElevenLabs.conversationalAi.PostWorkspaceSecretRequest => {
    if (type !== "new") throw new PayloadError("Create secret", ['type must be "new"']);
    return convert(schemas.conversationalAi.PostWorkspaceSecretRequest, rest, "Create secret");
  },

  secretUpdate: ({
    type,
    ...rest
  }: SecretUpdateWire): ElevenLabs.conversationalAi.PatchWorkspaceSecretRequest => {
    if (type !== "update") throw new PayloadError("Update secret", ['type must be "update"']);
    return convert(schemas.conversationalAi.PatchWorkspaceSecretRequest, rest, "Update secret");
  },
};
