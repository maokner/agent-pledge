/**
 * Safe handling of the env file with wallet seeds that setup-wallets.ts writes.
 * Kept apart from the script so it can be tested without the network.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** True if git ignores the path. `git check-ignore` exits 0 for an ignored path. */
export function isGitIgnored(path: string): boolean {
  const result = spawnSync("git", ["check-ignore", "--quiet", path], { cwd: dirname(path) });
  return result.status === 0;
}

/** Problems with the output path, checked before the script spends faucet funds. */
export function checkOutPath(path: string, force: boolean): { error?: string; warning?: string } {
  if (existsSync(path) && !force) {
    return {
      error: `${path} already exists. It may hold the seeds of funded wallets. Move it away, or pass --force to overwrite it.`,
    };
  }
  if (!isGitIgnored(path)) {
    return {
      warning: `${path} does not match a .gitignore pattern. Do not commit it: it holds seeds.`,
    };
  }
  return {};
}

/**
 * Writes the env block with file mode 600. With `replace` false, it never replaces an existing
 * file (flag "wx"). The mode option of writeFileSync applies only to a new file, so this also sets
 * the mode of a replaced file.
 */
export function writeEnvFile(path: string, block: string, replace: boolean): void {
  writeFileSync(path, block, { mode: 0o600, flag: replace ? "w" : "wx" });
  chmodSync(path, 0o600);
}
