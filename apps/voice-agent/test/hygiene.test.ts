import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PACKAGE_DIR } from "../src/paths.js";

/** Built from its code point so that this file does not contain the character itself. */
const EM_DASH = String.fromCodePoint(0x2014);
const SKIP = new Set(["node_modules", "dist", "coverage"]);
const TEXT = /\.(ts|md|json|txt|example)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return TEXT.test(name) || name === ".env.example" ? [path] : [];
  });
}

describe("package text files", () => {
  it("contain no em dash", () => {
    const offenders = files(PACKAGE_DIR).filter((f) => readFileSync(f, "utf8").includes(EM_DASH));
    expect(offenders.map((f) => relative(PACKAGE_DIR, f))).toEqual([]);
  });
});
