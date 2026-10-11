/**
 * `pnpm deploy:secrets`: prints fresh values for the four server secrets, ready to paste into Render
 * (docs/deploy.md). Run it once per environment and keep the output in the team's password manager.
 */
import { randomBytes } from "node:crypto";

for (const key of ["VOICE_SHARED_SECRET", "AGENT_TOKEN", "COOKIE_SECRET", "SEED_ENCRYPTION_KEY"]) {
  console.log(`${key}=${randomBytes(32).toString("hex")}`);
}
