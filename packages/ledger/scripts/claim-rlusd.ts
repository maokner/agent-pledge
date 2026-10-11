/**
 * Claims 10 testnet RLUSD from tryrlusd.com for one address.
 *
 *   TRYRLUSD_SESSION_COOKIE="__Secure-next-auth.session-token=..." \
 *   pnpm --filter @agent-pledge/ledger run claim-rlusd <address|vault|agent|requester>
 *
 * The faucet allows one claim per GitHub account every 24 hours, so pick the wallet that needs it.
 * The address must already have an RLUSD trust line (the setup script sets one).
 */
import { loadConfig, walletFromSeed } from "../src/index.js";

const ROLE_SEEDS = {
  vault: "XRPL_VAULT_SEED",
  agent: "XRPL_AGENT_SEED",
  requester: "XRPL_REQUESTER_SEED",
} as const;

async function main() {
  const target = process.argv[2];
  const cookie = process.env.TRYRLUSD_SESSION_COOKIE;
  if (!target) {
    console.error("Usage: claim-rlusd <address|vault|agent|requester>");
    process.exit(2);
  }
  if (!cookie) {
    console.error(
      "TRYRLUSD_SESSION_COOKIE is not set. Sign in at https://tryrlusd.com and copy the session cookie.",
    );
    process.exit(2);
  }
  let address = target;
  if (target in ROLE_SEEDS) {
    const seed = loadConfig()[ROLE_SEEDS[target as keyof typeof ROLE_SEEDS]];
    if (!seed)
      throw new Error(
        `${ROLE_SEEDS[target as keyof typeof ROLE_SEEDS]} is not set. Load packages/ledger/.env.testnet first.`,
      );
    address = walletFromSeed(seed).classicAddress;
  }
  const response = await fetch("https://tryrlusd.com/api/mint-xrpl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie.startsWith("__Secure-next-auth.session-token=")
        ? cookie
        : `__Secure-next-auth.session-token=${cookie}`,
      Origin: "https://tryrlusd.com",
      Referer: "https://tryrlusd.com/",
    },
    body: JSON.stringify({ address }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    console.error(
      `Faucet answered ${response.status}: ${String(body.error ?? body.message ?? "")}`,
    );
    if (typeof body.timeRemaining === "number")
      console.error(`Try again in ${Math.ceil(body.timeRemaining / 60)} hours.`);
    process.exit(1);
  }
  console.log(`${target} ${address}: ${String(body.message ?? "claimed")}`);
  if (typeof body.txHash === "string")
    console.log(`  https://testnet.xrpl.org/transactions/${body.txHash}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
