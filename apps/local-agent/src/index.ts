// Local agent (issues #27, #29): connects to /ws/agent, claims tasks, makes sub-tasks, posts on Yik Yak,
// and redeems the task NFT after the helper's PIN. See README.md in this folder and docs/api.md.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { LocalAgent } from "./agent";
import { loadConfig } from "./config";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"),
  quiet: true,
});

const config = loadConfig();
if (!config.agentToken) {
  console.error(
    "AGENT_TOKEN is not set. Copy apps/local-agent/.env.example to apps/local-agent/.env.",
  );
  process.exit(1);
}
if (config.agentMode === "llm" && !config.anthropicApiKey) {
  console.error("AGENT_MODE=llm needs ANTHROPIC_API_KEY (or set AGENT_MODE=scripted).");
  process.exit(1);
}

const agent = await LocalAgent.create(config);
agent.start();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) process.exit(1);
  stopping = true;
  console.log(`[agent] ${signal}: stopping`);
  await agent.stop();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
