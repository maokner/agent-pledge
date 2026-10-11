# ElevenLabs Agents API notes

Research for issue 13, done on 2026-10-11 without an API key.
Everything here comes from the public docs and the public OpenAPI spec.
Nothing was tested against a live ElevenLabs account.

## Sources

The OpenAPI spec is the main source, because the prose docs do not show every field.

| Source                                                                                       | Used for                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| https://api.elevenlabs.io/openapi.json                                                       | Exact request schemas: `ToolRequestModel`, `WebhookToolConfig-Input`, `WebhookToolApiSchemaConfig-Input`, `LiteralJsonSchemaProperty`, `ConvAISecretLocator`, `PostWorkspaceSecretRequest`, `Body_Create_Agent_v1_convai_agents_create_post`, `UpdatePhoneNumberRequest`, and the enums for LLMs and TTS models. |
| https://elevenlabs.io/docs/api-reference/tools/create                                        | `POST /v1/convai/tools` and the webhook tool fields.                                                                                                                                                                                                                                                             |
| https://elevenlabs.io/docs/api-reference/tools/list                                          | `GET /v1/convai/tools`.                                                                                                                                                                                                                                                                                          |
| https://elevenlabs.io/docs/api-reference/agents/create                                       | `POST /v1/convai/agents/create`.                                                                                                                                                                                                                                                                                 |
| https://elevenlabs.io/docs/api-reference/agents/update                                       | `PATCH /v1/convai/agents/{agent_id}`.                                                                                                                                                                                                                                                                            |
| https://elevenlabs.io/docs/api-reference/workspace/secrets/create                            | `POST /v1/convai/secrets` (workspace secrets).                                                                                                                                                                                                                                                                   |
| https://elevenlabs.io/docs/api-reference/phone-numbers/update                                | `PATCH /v1/convai/phone-numbers/{phone_number_id}` with `agent_id`.                                                                                                                                                                                                                                              |
| https://elevenlabs.io/docs/api-reference/phone-numbers/create                                | `POST /v1/convai/phone-numbers` (import a Twilio or SIP number).                                                                                                                                                                                                                                                 |
| https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools                   | Webhook (server) tools: path parameters in `{braces}`, body schema, and secret headers.                                                                                                                                                                                                                          |
| https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables     | System dynamic variables, including `system__caller_id`.                                                                                                                                                                                                                                                         |
| https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration | Importing a Twilio number and assigning it to an agent.                                                                                                                                                                                                                                                          |
| https://www.npmjs.com/package/@elevenlabs/elevenlabs-js                                      | The official SDK, version 2.71.0 (published 2026-10-05).                                                                                                                                                                                                                                                         |

The docs moved from `/docs/agents-platform/...` to `/docs/eleven-agents/...`.
The old URLs redirect.

## What we use

### Server tools are workspace tools

A webhook tool is created on its own with `POST /v1/convai/tools`.
The body is `{ "tool_config": { "type": "webhook", ... } }`.
The agent lists tool ids in `conversation_config.agent.prompt.tool_ids`.
The old inline field `prompt.tools` is deprecated.

`tools/create_task.json` and `tools/task_status.json` are exactly this body, with two `${...}` placeholders that `pnpm provision` fills in.

Fields that matter for us:

- `api_schema.url` can contain path parameters in braces, for example `.../tools/task_status/{task_id}`.
  Each one needs an entry in `api_schema.path_params_schema`.
- `api_schema.request_body_schema` is an object schema for POST bodies.
  Each property is a `LiteralJsonSchemaProperty`.
- A property gets its value from exactly one source: `description` (the LLM fills it), `dynamic_variable`, `constant_value`, `is_system_provided`, or `is_omitted`.
  The spec says these are mutually exclusive.
- `response_timeout_secs` must be from 5 to 300.
  The default is 20.
- `interruption_mode: "disable_during_tool_and_turn"` stops a noisy room from cutting off the agent while the tool runs and while it reads the result.
  We use it for create_task, so the PIN readout is not cut off.
- `pre_tool_speech: "force"` makes the agent say something ("One moment.") before the tool call.
- `tool_error_handling_mode: "passthrough"` gives the agent the raw error.
  The default (`auto`) hides errors from webhook tools, which could make the agent unsure whether the call failed.

### Caller ID

`system__caller_id` is the caller's phone number.
The docs say it is set for voice calls only.
The tool fills `caller_phone` with `"dynamic_variable": "system__caller_id"`, so the LLM never sees or invents it.

### Secret header

`api_schema.request_headers` is a map from header name to one of: a plain string, `{ "secret_id": ... }`, `{ "variable_name": ... }`, or `{ "env_var_label": ... }`.
We store `VOICE_TOOL_SECRET` as a workspace secret named `agent_pledge_voice_tool_secret` (`POST /v1/convai/secrets` with `{ "type": "new", "name", "value" }`).
The tools send it as `"x-voice-secret": { "secret_id": "<id>" }`.
Thus, the secret value is never in the tool config or in the git repo.
`PATCH /v1/convai/secrets/{secret_id}` with `{ "type": "update", "name", "value" }` rotates it.

### Phone numbers

The API has no endpoint to buy a phone number.
A number comes from Twilio, Exotel, or a SIP trunk.
It is imported in the dashboard (Phone Numbers page) or with `POST /v1/convai/phone-numbers` (for Twilio: `phone_number`, `label`, `sid`, `token`, optional `agent_id`).
The Twilio guide recommends a Twilio API key (SID starting with `SK`) over the account auth token.
A Twilio "verified caller ID" cannot take inbound calls, so it cannot be used for the demo.
To route an existing number to our agent, the script sends `PATCH /v1/convai/phone-numbers/{phone_number_id}` with `{ "agent_id": "<agent id>" }`.

### The SDK

`@elevenlabs/elevenlabs-js` 2.71.0 covers every endpoint we need: `conversationalAi.tools`, `conversationalAi.agents`, `conversationalAi.secrets`, and `conversationalAi.phoneNumbers`.
The SDK takes camelCase objects, converts them to snake_case JSON, and silently drops unknown keys.
To keep the dry run honest, `src/sdk-payloads.ts` keeps all payloads in the wire format and converts them with the SDK's own serializers, with unknown keys, enum values, and union members rejected.
It then converts them back and requires an exact match.
Thus, a typo in a field name fails in tests and in the dry run, instead of being dropped.
The wire types come from the SDK too (`serialization/*.Raw`), so most mistakes fail at compile time.

## Uncertainties

These points are not clear from the docs.
Check them in the first live session, and update this file.

1. **Caller ID outside a phone call.**
   The docs say `system__caller_id` is for voice calls only.
   They do not say what a dashboard test call or a widget call sends.
   It may be empty, missing, or make the tool call fail.
   The mock server accepts an empty `caller_phone`, and the real server should too.
   Test the full flow with a real phone call.
2. **A dynamic-variable property in `required`.**
   We list `caller_phone` in `required` together with the LLM-filled fields.
   The schema allows it.
   If the API rejects it, remove `caller_phone` from `required`.
3. **The caller ID format.**
   We expect E.164, for example `+15105550123`.
   The server must not depend on the format.
4. **PATCH semantics for agents.**
   We send full `agent`, `asr`, `tts`, and `conversation` sections on every update.
   We expect `tool_ids` to be replaced, not merged.
5. **Phone audio format.**
   We do not set `asr.user_input_audio_format` or `tts.agent_output_audio_format`.
   We expect ElevenLabs to pick the telephony format when a Twilio number is assigned.
   If calls sound wrong, check these two settings in the dashboard.
6. **How a network failure looks to the agent.**
   With `passthrough`, an HTTP error body reaches the agent.
   When the server is down, the exact text the agent gets is not documented.
   The prompt treats any error, timeout, or missing PIN the same way.
7. **Digit readout.**
   With `text_normalisation_type: "system_prompt"` (the default), the LLM writes numbers as words.
   The voice may say "oh" for the digit zero.
8. **Model choices.**
   We use the API defaults: LLM `gemini-2.5-flash` and TTS `eleven_v4_turbo`.
   Both can be changed with `ELEVENLABS_LLM` and `ELEVENLABS_TTS_MODEL`.
   The voice is the API default voice until someone picks a clearer one (issue 11).
9. **SDK and spec drift.**
   The spec lets `GET /v1/convai/tools` filter by `used_by_agent_id`, but SDK 2.71.0 does not have that parameter yet.
   We find existing tools through the agent's `tool_ids` instead.
   We import the SDK serializers from `@elevenlabs/elevenlabs-js/serialization/index.js`, which is not a documented entry point.
   If a later SDK version blocks that path, the typecheck fails, and the fix is to pin the version.
