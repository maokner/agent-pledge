/**
 * Moves the configured token between the live wallets from the setup env file.
 *
 *   pnpm --filter @agent-pledge/ledger run transfer <from> <to> <amount>
 *
 * <from> is a role: vault, agent, or requester. <to> is a role or an r... address.
 * Load the env file first: set -a; . packages/ledger/.env.testnet; set +a
 */
import { disconnect, getClient, loadConfig, transferToken, walletFromSeed } from "../src/index.js";

const ROLE_SEEDS = {
  vault: "XRPL_VAULT_SEED",
  agent: "XRPL_AGENT_SEED",
  requester: "XRPL_REQUESTER_SEED",
} as const;
type Role = keyof typeof ROLE_SEEDS;

async function main() {
  const [from, to, amount] = process.argv.slice(2);
  if (!from || !to || !amount || !(from in ROLE_SEEDS)) {
    console.error("Usage: transfer <vault|agent|requester> <role|address> <amount>");
    process.exit(2);
  }
  const config = loadConfig();
  const seedOf = (role: Role) => {
    const seed = config[ROLE_SEEDS[role]];
    if (!seed)
      throw new Error(`${ROLE_SEEDS[role]} is not set. Load packages/ledger/.env.testnet first.`);
    return seed;
  };
  const sender = walletFromSeed(seedOf(from as Role));
  const destination = to in ROLE_SEEDS ? walletFromSeed(seedOf(to as Role)).classicAddress : to;
  const client = await getClient(config);
  const tx = await transferToken({ from: sender, to: destination, amount }, { client, config });
  console.log(`${from} -> ${to}: ${amount}  ${tx.explorerUrl}`);
  await disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await disconnect().catch(() => undefined);
  process.exit(1);
});
