/**
 * Creates or updates the ElevenLabs agent for Agent Pledge.
 * Usage: pnpm provision [--dry-run] [--create-new] [--rotate-secret] [--skip-server-check]
 * See apps/voice-agent/README.md and .env.example.
 */
import { parseArgs } from "node:util";
import { loadAssets } from "../src/assets.js";
import { ConfigError, loadProvisionConfig } from "../src/config.js";
import { DryRunApi } from "../src/dry-run-api.js";
import { createElevenLabsApi } from "../src/elevenlabs-api.js";
import { loadDotEnv } from "../src/paths.js";
import { provision } from "../src/provision.js";
import { runServerCheck } from "../src/simulate.js";

const USAGE = `Usage: pnpm provision [--dry-run] [--create-new] [--rotate-secret] [--skip-server-check]

  --dry-run            Print the exact API requests. Makes no network call and needs no API key.
  --create-new         Create a new agent even if one with the same name exists.
  --rotate-secret      Replace the value of the workspace secret if it exists.
                       Every agent in the ElevenLabs workspace uses that secret.
  --skip-server-check  Do not check the server at PUBLIC_BASE_URL before the first write.

Env: ELEVENLABS_API_KEY, PUBLIC_BASE_URL, VOICE_TOOL_SECRET, ELEVENLABS_AGENT_ID,
     ELEVENLABS_PHONE_NUMBER_ID, ELEVENLABS_VOICE_ID, ELEVENLABS_LLM, ELEVENLABS_TTS_MODEL,
     ELEVENLABS_AGENT_NAME, ELEVENLABS_BASE_URL`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      "create-new": { type: "boolean", default: false },
      "rotate-secret": { type: "boolean", default: false },
      "skip-server-check": { type: "boolean", default: false },
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
    rotateSecret: values["rotate-secret"],
    skipServerCheck: values["skip-server-check"],
  });
  for (const w of warnings) console.error(`warning: ${w}`);
  const assets = loadAssets();

  if (dryRun) {
    const api = new DryRunApi({ existingAgentId: config.agentId });
    const apiHost = (config.apiBaseUrl ?? "https://api.elevenlabs.io").replace(/\/+$/, "");
    const steps: string[] = [];
    await provision(config, assets, api, {
      checkServer: api.checkServer,
      log: (line) => steps.push(line),
    });
    console.log("Dry run: no network calls were made.\n");
    if (api.plannedServerChecks.length > 0) {
      console.log("Server checks that a real run makes before any write:");
      for (const c of api.plannedServerChecks) console.log(`  ${c}`);
      console.log("");
    }
    console.log("Reads that the dry run skipped, and what it assumed:");
    for (const r of api.skippedReads) console.log(`  ${r}`);
    console.log("\nSteps:");
    for (const line of steps) console.log(`  ${line}`);
    console.log("\nThese are the requests that a real run sends:");
    for (const call of api.calls) {
      console.log(`\n=== ${call.method} ${apiHost}${call.path}`);
      console.log(JSON.stringify(call.body, null, 2));
    }
    return;
  }

  if (!config.apiKey) throw new ConfigError(["ELEVENLABS_API_KEY is required."]);
  const api = createElevenLabsApi({ apiKey: config.apiKey, baseUrl: config.apiBaseUrl });
  const result = await provision(config, assets, api, {
    checkServer: (baseUrl, secret) => runServerCheck({ baseUrl, secret }),
    log: (line) => console.log(line),
  });
  console.log("\nDone.");
  console.log(`  agent_id:        ${result.agentId}`);
  console.log(`  create_task:     ${result.toolIds.create_task}`);
  console.log(`  task_status:     ${result.toolIds.task_status}`);
  console.log(`  secret_id:       ${result.secretId}${result.secretWritten ? "" : " (kept)"}`);
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
