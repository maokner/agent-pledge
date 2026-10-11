import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkOutPath, isGitIgnored, writeEnvFile } from "../env-file.js";

const tmp = () => mkdtempSync(join(tmpdir(), "env-file-"));
const mode = (path: string) => statSync(path).mode & 0o777;

describe("writeEnvFile", () => {
  it("creates the file with mode 600", () => {
    const path = join(tmp(), ".env.testnet");
    writeEnvFile(path, "A=1\n", false);
    expect(readFileSync(path, "utf8")).toBe("A=1\n");
    expect(mode(path)).toBe(0o600);
  });

  it("never replaces an existing file unless asked", () => {
    const path = join(tmp(), ".env.testnet");
    writeFileSync(path, "OLD=1\n");
    expect(() => writeEnvFile(path, "A=1\n", false)).toThrow(/EEXIST/);
    expect(readFileSync(path, "utf8")).toBe("OLD=1\n");
  });

  it("fixes the mode of a replaced file", () => {
    const path = join(tmp(), ".env.testnet");
    writeFileSync(path, "OLD=1\n", { mode: 0o644 });
    writeEnvFile(path, "A=1\n", true);
    expect(readFileSync(path, "utf8")).toBe("A=1\n");
    expect(mode(path)).toBe(0o600);
  });
});

describe("checkOutPath", () => {
  it("refuses an existing file without force", () => {
    const path = join(tmp(), "wallets.env");
    writeFileSync(path, "X=1\n");
    expect(checkOutPath(path, false).error).toMatch(/already exists/);
    expect(checkOutPath(path, true).error).toBeUndefined();
  });

  it("warns for a path that git does not ignore", () => {
    // A temp dir is outside any repository, so nothing ignores it.
    expect(checkOutPath(join(tmp(), "wallets.txt"), false).warning).toMatch(/\.gitignore/);
  });

  it("does not warn for the default path, which the root .gitignore covers", () => {
    const path = fileURLToPath(new URL("../../.env.testnet", import.meta.url));
    expect(isGitIgnored(path)).toBe(true);
    expect(checkOutPath(path, true)).toEqual({});
  });
});
