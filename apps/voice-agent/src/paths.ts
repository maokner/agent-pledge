import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** Absolute path of apps/voice-agent. */
export const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

export function packagePath(...parts: string[]): string {
  return join(PACKAGE_DIR, ...parts);
}

/** Loads apps/voice-agent/.env into process.env if it exists. Real environment variables win. */
export function loadDotEnv(): void {
  const file = packagePath(".env");
  if (existsSync(file)) process.loadEnvFile(file);
}
