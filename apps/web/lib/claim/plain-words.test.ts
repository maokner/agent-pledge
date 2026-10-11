import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { hasCryptoWord, PLAIN_FALLBACK_MESSAGE, plainMessage } from "./plain-words";

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Everything the human side (the claim page and the /human list) shows comes from these folders. */
const SCANNED = [
  "components/claim",
  "components/human",
  "lib/claim",
  "app/(human)/c",
  "components/open-list",
  "lib/open-list",
  "app/(human)/human",
  "lib/human-stats",
];
/** The word list itself, and tests (which quote server errors on purpose). */
const SKIPPED = [/plain-words\.ts$/, /\.test\.tsx?$/];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(WEB_ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => join(WEB_ROOT, dir, file))
    .filter((file) => !SKIPPED.some((skip) => skip.test(file)));
}

/**
 * The text a file can put on screen: string and template literals and JSX
 * text. Comments, identifiers (formatRlusd, ExplorerLink…) and import paths
 * are not text, so they are left out.
 */
function userFacingStrings(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportTypeNode(node))
      return;
    if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) {
      // Template literals come in parts around each ${…}: head, middles and tail.
      found.push(node.text);
    } else if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (text) found.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("hasCryptoWord", () => {
  it("finds the words in any case, alone or plural", () => {
    for (const text of [
      "Your wallet",
      "an NFT",
      "NFTs",
      "XRPL",
      "the XRP Ledger",
      "RLUSD",
      "ledger",
      "Tokens",
      "testnet",
    ]) {
      expect(hasCryptoWord(text), text).toBe(true);
    }
  });

  it("leaves plain words alone", () => {
    for (const text of [
      "Claim",
      "Enter the PIN",
      "Paid $4.00",
      "View payment",
      "Sub-task",
      "Helper",
      "untokenized",
    ]) {
      expect(hasCryptoWord(text), text).toBe(false);
    }
  });
});

describe("plainMessage", () => {
  it("keeps a plain server message", () => {
    expect(plainMessage("Someone else claimed this first.")).toBe(
      "Someone else claimed this first.",
    );
  });

  it("replaces one that talks about the plumbing", () => {
    expect(plainMessage("The ledger did not accept the claim.")).toBe(PLAIN_FALLBACK_MESSAGE);
    expect(plainMessage("tecNO_DST: wallet not funded")).toBe(PLAIN_FALLBACK_MESSAGE);
  });
});

describe("the human side's copy (PRD R7)", () => {
  it("reads strings and JSX text but not comments, identifiers or imports", () => {
    const source = `
      import { formatRlusd } from "@/lib/ledger";
      // Pays out over the XRP Ledger.
      /** Makes a wallet. */
      const label = "Claim";
      const line = \`Paid \${formatRlusd(amount)} today\`;
      export function X() { return <p title="Send">Enter the <b>PIN</b></p>; }
    `;
    expect(userFacingStrings("x.tsx", source)).toEqual([
      "Claim",
      "Paid ",
      " today",
      "Send",
      "Enter the",
      "PIN",
    ]);
  });

  it("scans every claim page and /human page file", () => {
    const files = SCANNED.flatMap(sourceFiles).map((f) => relative(WEB_ROOT, f));
    expect(files).toEqual(
      expect.arrayContaining([
        "components/claim/PaidView.tsx",
        "components/human/Button.tsx",
        "lib/claim/flow.ts",
        "components/open-list/OpenList.tsx",
        "components/open-list/OpenSubtaskCard.tsx",
        "lib/open-list/label.ts",
        "lib/open-list/announce.ts",
        "app/(human)/human/page.tsx",
        "components/human/SiteNav.tsx",
        "components/open-list/HowItWorks.tsx",
        "components/open-list/StatsBand.tsx",
        "lib/open-list/icon.ts",
        "lib/open-list/bento.ts",
        "lib/human-stats/stats.ts",
      ]),
    );
  });

  it("has no crypto words: wallet, NFT, XRPL, XRP Ledger, RLUSD, ledger, token or testnet", () => {
    const offenders = SCANNED.flatMap(sourceFiles).flatMap((file) =>
      userFacingStrings(file, readFileSync(file, "utf8"))
        .filter(hasCryptoWord)
        .map((text) => `${relative(WEB_ROOT, file)}: ${JSON.stringify(text)}`),
    );
    expect(offenders).toEqual([]);
  });
});
