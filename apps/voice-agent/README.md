# Voice agent (ElevenLabs)

The ElevenLabs phone agent for Agent Pledge.
A requester calls, says what seat to save, where, how fast, and for how much.
The agent confirms the four values, calls the server's `create_task` tool, and reads the PIN back two times.
See the root README section 6 for the requirements, and GitHub issues 11 to 15.

Everything in this package works and is tested without an ElevenLabs API key.

## Layout

| Path | What it is |
|---|---|
| `prompt/system-prompt.md` | The agent's system prompt (issue 12). |
| `prompt/first-message.txt` | What the agent says when it answers. |
| `tools/create_task.json`, `tools/task_status.json` | The two server tools, in the exact `POST /v1/convai/tools` format, with `${PUBLIC_BASE_URL}` and `${VOICE_TOOL_SECRET_ID}` placeholders (issue 13). |
| `transcripts/` | Sample calls: normal, no price, not a seat, server error, "right now", and a seat with a coffee. Tests check them against the prompt rules and the samples. |
| `scripts/provision.ts` | Creates or updates the agent (`pnpm provision`). |
| `scripts/mock-server.ts` | A local stand-in for the server's tool endpoints (`pnpm mock-server`). |
| `scripts/simulate.ts` | Sends the sample payloads to a server and checks the responses (`pnpm simulate`). |
| `src/` | Payload builders, the SDK client, the mock server handlers, and the contract schemas. |
| `test/` | Vitest tests. No test uses the network. |
| `TESTING.md` | The test plan for R1 and R9 (issue 14). |
| `docs/elevenlabs-notes.md` | What we learned about the ElevenLabs API, with sources and open questions. |
| `docs/track-questions.md` | Questions for the Ripple and YZi Labs tables (issue 15). |

## Commands

Run these from `apps/voice-agent`, or with `pnpm --filter @agent-pledge/voice-agent <command>` from the repo root.

| Command | What it does |
|---|---|
| `pnpm provision --dry-run` | Prints every API request that a real run sends. No network call, no API key. |
| `pnpm provision` | Creates or updates the secret, the two tools, the agent, and the phone number link. |
| `pnpm provision --create-new` | Creates another agent even if one with the same name exists. |
| `pnpm mock-server` | Starts the mock tool server on port 8787. Add `--fail create_task` to rehearse the error path. |
| `pnpm simulate` | Starts a mock server in the process and runs the contract checks. |
| `pnpm simulate --url <base-url>` | Runs the contract checks against a running server, for example the deployed one. |
| `pnpm test`, `pnpm typecheck`, `pnpm lint` | The usual checks. |

## Environment variables

Copy `.env.example` to `.env` in this directory.
The scripts read `.env` if it exists; real environment variables win.

| Variable | Used by | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | provision | Required, except for `--dry-run`. |
| `PUBLIC_BASE_URL` | provision | Public https base URL of the server or of a tunnel to the mock server. Required, except for `--dry-run`, which uses `http://localhost:8787`. |
| `VOICE_TOOL_SECRET` | provision, mock-server, simulate | The shared secret for the `x-voice-secret` header. At least 16 characters. Make one with `openssl rand -hex 24`. |
| `ELEVENLABS_AGENT_ID` | provision | Set it after the first run. With it, the script updates the agent instead of making a new one. |
| `ELEVENLABS_PHONE_NUMBER_ID` | provision | Optional. The script routes this number to the agent. |
| `ELEVENLABS_VOICE_ID` | provision | Optional. Defaults to the ElevenLabs API default voice. |
| `ELEVENLABS_LLM` | provision | Optional. Defaults to `gemini-2.5-flash`. |
| `ELEVENLABS_TTS_MODEL` | provision | Optional. Defaults to `eleven_v4_turbo`. |
| `ELEVENLABS_AGENT_NAME` | provision | Optional. Defaults to `Agent Pledge`. |
| `ELEVENLABS_BASE_URL` | provision | Optional. For a regional ElevenLabs API host. |
| `MOCK_PORT`, `MOCK_BOARD_URL`, `MOCK_FAIL` | mock-server | Optional. Port 8787, `board_url` to return, and the fail mode. |

## How provisioning works

`pnpm provision` does these steps in order:

1. Stores `VOICE_TOOL_SECRET` as the workspace secret `agent_pledge_voice_tool_secret`, or updates it.
2. Creates or updates the `create_task` and `task_status` webhook tools.
   Each tool sends the secret as the `x-voice-secret` header from the secret store.
   `create_task` fills `caller_phone` from `system__caller_id` and `call_id` from `system__conversation_id`, so the LLM never fills them.
3. Creates or updates the agent with the prompt, the first message, the tool ids, the `end_call` tool, and the voice settings.
4. If `ELEVENLABS_PHONE_NUMBER_ID` is set, routes that number to the agent.

The run is idempotent.
With `ELEVENLABS_AGENT_ID` set, it finds the existing tools through the agent and updates everything in place.
Without it, the script refuses to run if an agent with the same name exists, so it never makes duplicates by accident.

The payloads are pure functions in `src/payloads.ts`.
Before any request, `src/sdk-payloads.ts` checks each payload against the official SDK schemas, with unknown fields rejected.
The dry run uses the same code and the same checks, and only replaces the API client.

## The tool contract for the server

The server (issue 19) must implement this contract.
`pnpm simulate --url <server>` checks it.

| | `create_task` | `task_status` |
|---|---|---|
| Request | `POST /tools/create_task` with a JSON body `CreateTaskInput` | `GET /tools/task_status/:task_id` |
| Auth | Header `x-voice-secret` must equal `VOICE_TOOL_SECRET`. Otherwise 401. | Same |
| Success | 200 with `CreateTaskOutput`: `task_id`, `pin` (exactly 4 digits, as a string), `board_url` | 200 with `TaskStatusOutput`: `status` (`open`, `claimed`, `done`, `failed`), `helper_note` (string or null) |
| Errors | 400 for invalid input, 401, 503 when unavailable | 401, 404 for an unknown task |
| Retries | A repeated `call_id` returns the existing task (same `task_id`, `pin`, and `board_url`) with 200 and creates nothing. | Safe to repeat. |
| Time limit | Answer within 30 seconds. Answer before ledger transactions validate, if possible, because the caller waits in silence. | Answer within 10 seconds. |

Notes for the server:

- The types are in `packages/shared` (`CreateTaskInput`, `CreateTaskOutput`, `TaskStatusOutput`).
- `time_limit_minutes` is a whole number of at least 1, and `price_usd` is a positive number.
  The agent rounds a time up ("right now" becomes 2 minutes), so a 400 should be rare.
- For a value that is not valid, answer 400 with `"error": "invalid_input"` and name the field in `details`, for example `"time_limit_minutes: ..."`.
  The agent then asks the caller for that value again.
  For every other failure, use another code, so that the agent offers a retry instead.
- `caller_phone` comes from the caller ID.
  It may be an empty string in a call without a phone line, such as a dashboard test.
- `call_id` is the ElevenLabs conversation id, and the server must dedupe on it.
  The agent calls `create_task` again after an error or a timeout, and the first attempt may have worked on the server.
  Without dedupe, that retry makes a second task and a second payment, and the caller hears the PIN of the second task only.
  Validate the body first, then look up `call_id`.
  If a task with that `call_id` exists, return it, even if the new body has other values.
  One call creates at most one task.
  The retry can arrive while the first request is still running, because ElevenLabs stops waiting after 30 seconds.
  So reserve the `call_id` before the ledger work, for example with a unique index, and make the second request wait for the result of the first.
  An absent or empty `call_id` (for example from the board's web form) means no dedupe.
- Error bodies use `{ "error": "<code>", "message": "<text>", "details": ["..."] }`.
  The agent gets the error body, so the message must not contain a PIN.
- The mock server's `src/mock-server.ts` is a reference implementation of this contract.

## What still needs a person

These steps need real credentials or a real phone, so they are not done yet:

1. **ElevenLabs account and API key** (issue 11).
   Create the key with Agents access and put it in `.env`.
2. **First provision.**
   Run `pnpm provision --dry-run`, check the output, then run `pnpm provision`.
   Save the printed `ELEVENLABS_AGENT_ID` in `.env`.
3. **Phone number** (issue 11).
   ElevenLabs does not sell numbers through the API.
   Buy a number in Twilio (a purchased number, not a verified caller ID), and import it on the ElevenLabs Phone Numbers page with a Twilio API key SID and secret.
   Put its id in `ELEVENLABS_PHONE_NUMBER_ID` and run `pnpm provision` again, or assign the agent in the dashboard.
   Put the number in the root README and the team doc.
4. **Voice choice** (issue 11).
   Try two or three voices on speakerphone in a loud room, and set `ELEVENLABS_VOICE_ID`.
5. **Live calls** (issues 12, 13, and 14).
   Follow `TESTING.md`, first against the mock server through a tunnel, then against the deployed server.
   Post the results on issue 14.
6. **Open API questions.**
   Check the uncertainties in `docs/elevenlabs-notes.md` during the first live session.
7. **Track questions** (issue 15).
   Ask the questions in `docs/track-questions.md` and record the answers in the root README decision log.
