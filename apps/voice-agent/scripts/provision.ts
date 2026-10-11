/**
 * Creates or updates the ElevenLabs agent for Agent Pledge.
 * Usage: pnpm provision [--dry-run] [--create-new]
 * See apps/voice-agent/README.md and .env.example.
 */
import { parseArgs } from "node:util";
import { loadAssets } from "../src/assets.js";
import { ConfigError, loadProvisionConfig } from "../src/config.js";
import { DryRunApi } from "../src/dry-run-api.js";
import { createElevenLabsApi } from "../src/elevenlabs-api.js";
import { loadDotEnv } from "../src/paths.js";
import { provision } from "../src/provision.js";

const USAGE = `Usage: pnpm provision [--dry-run] [--create-new]

  --dry-run      Print the exact API requests. Makes no network call and needs no API key.
  --create-new   Create a new agent even if one with the same name exists.

Env: ELEVENLABS_API_KEY, PUBLIC_BASE_URL, VOICE_TOOL_SECRET, ELEVENLABS_AGENT_ID,
     ELEVENLABS_PHONE_NUMBER_ID, ELEVENLABS_VOICE_ID, ELEVENLABS_LLM, ELEVENLABS_TTS_MODEL,
     ELEVENLABS_AGENT_NAME, ELEVENLABS_BASE_URL`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      "create-new": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  loadDotEnv();
  const dryRun = values["dry-run"];
  const { config, warnings } = loadProvisionConfig(process.env, {
    dryRun,
    createNew: values["create-new"],
  });
  for (const w of warnings) console.error(`warning: ${w}`);
  const assets = loadAssets();

  if (dryRun) {
    const api = new DryRunApi();
    const apiHost = (config.apiBaseUrl ?? "https://api.elevenlabs.io").replace(/\/+$/, "");
    await provision(config, assets, api);
    console.log("Dry run: no network calls were made. These are the requests a real run sends.\n");
    for (const r of api.skippedReads) console.log(`(skipped read, assumed empty) ${r}`);
    for (const call of api.calls) {
      console.log(`\n=== ${call.method} ${apiHost}${call.path}`);
      console.log(JSON.stringify(call.body, null, 2));
    }
    return;
  }

  if (!config.apiKey) throw new ConfigError(["ELEVENLABS_API_KEY is required."]);
  const api = createElevenLabsApi({ apiKey: config.apiKey, baseUrl: config.apiBaseUrl });
  const result = await provision(config, assets, api, (line) => console.log(line));
  console.log("\nDone.");
  console.log(`  agent_id:        ${result.agentId}`);
  console.log(`  create_task:     ${result.toolIds.create_task}`);
  console.log(`  task_status:     ${result.toolIds.task_status}`);
  console.log(`  secret_id:       ${result.secretId}`);
  console.log(
    `  phone_number_id: ${result.phoneNumberId ?? "(not set, no phone number attached)"}`,
  );
  if (result.agentCreated) {
    console.log(`\nAdd this line to apps/voice-agent/.env so the next run updates this agent:`);
    console.log(`  ELEVENLABS_AGENT_ID=${result.agentId}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
