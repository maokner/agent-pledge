/**
 * Spike for issue #2: does the XRPL accept an open NFT sell offer with Amount "0" and no Destination,
 * and does a second accept fail? Also probes the result codes that src/submit.ts maps.
 *
 *   pnpm --filter @agent-pledge/ledger run spike
 *
 * Uses fresh faucet wallets, so it does not touch the demo wallets. Progress goes to stderr; a
 * Markdown results table goes to stdout.
 */
import {
  AccountSetAsfFlags,
  getNFTokenID,
  NFTokenMintFlags,
  type Amount,
  type Client,
  type TransactionMetadata,
  type TxResponse,
  type Wallet,
} from "xrpl";
import {
  createFundedWallet,
  disconnect,
  ensureTrustLine,
  explorerNftUrl,
  explorerTxUrl,
  getClient,
  LedgerError,
  loadConfig,
  submitTx,
  toHex,
  tokenAmount,
  type LedgerConfig,
} from "../src/index.js";

const log = (...parts: unknown[]) => console.error(...parts);

interface Row {
  step: string;
  expected: string;
  actual: string;
  error: string;
  hash: string | undefined;
  onLedger: boolean;
}

const rows: Row[] = [];
const config = loadConfig();

/** Runs one transaction and records its result code, whether it succeeds or throws. */
async function attempt(
  step: string,
  expected: string,
  run: () => Promise<TxResponse>,
): Promise<TxResponse | undefined> {
  log(`- ${step}`);
  try {
    const response = await run();
    rows.push({
      step,
      expected,
      actual: "tesSUCCESS",
      error: "",
      hash: response.result.hash,
      onLedger: true,
    });
    log(`  tesSUCCESS ${explorerTxUrl(config, response.result.hash)}`);
    return response;
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    const actual = error.resultCode ?? error.code;
    // tec codes are in a validated ledger; tem, tef, and tel codes never reach one.
    const onLedger = actual.startsWith("tec");
    rows.push({ step, expected, actual, error: error.name, hash: error.hash, onLedger });
    log(
      `  ${actual} -> ${error.name}${error.hash && onLedger ? ` ${explorerTxUrl(config, error.hash)}` : ""}`,
    );
    return undefined;
  }
}

function nftIdOf(response: TxResponse): string {
  const meta = response.result.meta as TransactionMetadata & { nftoken_id?: string };
  const id = meta.nftoken_id ?? getNFTokenID(meta);
  if (!id) throw new Error("No NFT ID in the mint metadata");
  return id;
}

function offerIdOf(response: TxResponse): string {
  const meta = response.result.meta as TransactionMetadata & { offer_id?: string };
  if (meta.offer_id) return meta.offer_id;
  for (const node of meta.AffectedNodes) {
    if ("CreatedNode" in node && node.CreatedNode.LedgerEntryType === "NFTokenOffer") {
      return node.CreatedNode.LedgerIndex;
    }
  }
  throw new Error("No offer ID in the metadata");
}

const flags = NFTokenMintFlags.tfBurnable | NFTokenMintFlags.tfTransferable;

async function mint(client: Client, vault: Wallet, label: string, extra: object = {}) {
  return submitTx(
    client,
    vault,
    {
      TransactionType: "NFTokenMint",
      Account: vault.classicAddress,
      NFTokenTaxon: 0,
      Flags: flags,
      URI: toHex(`https://agent-pledge.invalid/spike/${label}`),
      ...extra,
    },
    { config, taskId: `spike-${label}` },
  );
}

async function sellOffer(
  client: Client,
  vault: Wallet,
  nftId: string,
  amount: Amount,
  destination?: string,
) {
  return submitTx(
    client,
    vault,
    {
      TransactionType: "NFTokenCreateOffer",
      Account: vault.classicAddress,
      NFTokenID: nftId,
      Amount: amount,
      Flags: 1, // tfSellNFToken
      ...(destination ? { Destination: destination } : {}),
    },
    { config },
  );
}

const accept = (client: Client, wallet: Wallet, offerId: string) =>
  submitTx(
    client,
    wallet,
    {
      TransactionType: "NFTokenAcceptOffer",
      Account: wallet.classicAddress,
      NFTokenSellOffer: offerId,
    },
    { config },
  );

const burn = (client: Client, vault: Wallet, nftId: string, owner: string) =>
  submitTx(
    client,
    vault,
    {
      TransactionType: "NFTokenBurn",
      Account: vault.classicAddress,
      NFTokenID: nftId,
      Owner: owner,
    },
    { config },
  );

async function nftsOf(client: Client, address: string): Promise<string[]> {
  const response = await client.request({
    command: "account_nfts",
    account: address,
    ledger_index: "validated",
  });
  return response.result.account_nfts.map((n) => n.NFTokenID);
}

async function main(): Promise<void> {
  const client = await getClient(config);
  log("Funding vault, B, and C from the faucet");
  const [vault, b, c] = await Promise.all([
    createFundedWallet(client),
    createFundedWallet(client),
    createFundedWallet(client),
  ]);
  log(`vault ${vault.classicAddress}\nB     ${b.classicAddress}\nC     ${c.classicAddress}`);

  // Core spike: steps 1 to 5 of issue #2.
  const minted = await attempt(
    "1. Vault mints NFT with tfBurnable and tfTransferable",
    "tesSUCCESS",
    () => mint(client, vault, "core"),
  );
  if (!minted) throw new Error("Mint failed; cannot continue");
  const nftId = nftIdOf(minted);
  log(`  NFT ${explorerNftUrl(config, nftId)}`);

  let offer = await attempt('2. Vault sell offer, Amount "0", no Destination', "tesSUCCESS", () =>
    sellOffer(client, vault, nftId, "0"),
  );
  if (!offer) {
    offer = await attempt(
      '2b. Fallback: sell offer, Amount "1" drop, no Destination',
      "tesSUCCESS",
      () => sellOffer(client, vault, nftId, "1"),
    );
  }
  if (!offer) throw new Error("No open offer could be made");
  const offerId = offerIdOf(offer);

  await attempt("3. B accepts the open offer", "tesSUCCESS", () => accept(client, b, offerId));
  await attempt("4. C accepts the same offer", "tecOBJECT_NOT_FOUND", () =>
    accept(client, c, offerId),
  );
  log(`  B holds the NFT: ${(await nftsOf(client, b.classicAddress)).includes(nftId)}`);
  await attempt("5. Vault burns the NFT while B holds it", "tesSUCCESS", () =>
    burn(client, vault, nftId, b.classicAddress),
  );
  log(`  B still holds the NFT: ${(await nftsOf(client, b.classicAddress)).includes(nftId)}`);

  // Extra probes for the ops code and the result code mapping.
  const raceMint = await mint(client, vault, "race");
  const raceNft = nftIdOf(raceMint);
  const raceOffer = offerIdOf(await sellOffer(client, vault, raceNft, "0"));
  log("- 6. B and C accept one open offer at the same time");
  await Promise.all([
    attempt("6a. Race: B accepts", "one of 6a/6b tesSUCCESS", () => accept(client, b, raceOffer)),
    attempt("6b. Race: C accepts", "the other tecOBJECT_NOT_FOUND", () =>
      accept(client, c, raceOffer),
    ),
  ]);

  const mintOffer = await attempt(
    '7. NFTokenMint with Amount "0" (mint and open offer in one transaction)',
    "tesSUCCESS",
    () => mint(client, vault, "mint-offer", { Amount: "0" }),
  );
  if (mintOffer) {
    const id = offerIdOf(mintOffer);
    await attempt("7b. B accepts the offer made by the mint", "tesSUCCESS", () =>
      accept(client, b, id),
    );
  }

  const destNft = nftIdOf(await mint(client, vault, "destination"));
  const destOffer = offerIdOf(await sellOffer(client, vault, destNft, "0", b.classicAddress));
  await attempt("8. C accepts an offer whose Destination is B", "tecNO_PERMISSION", () =>
    accept(client, c, destOffer),
  );
  await attempt("9. Sell offer with a zero token (IOU) Amount", "temBAD_AMOUNT", () =>
    sellOffer(client, vault, destNft, tokenAmount(config, 0)),
  );
  await attempt("10. Vault burns an NFT that is already burned", "tecNO_ENTRY", () =>
    burn(client, vault, nftId, b.classicAddress),
  );

  // Token probes with a throwaway issuer, so they do not depend on RLUSD balances.
  log("Creating a throwaway token issuer for the token probes");
  const issuer = await createFundedWallet(client);
  await submitTx(
    client,
    issuer,
    {
      TransactionType: "AccountSet",
      Account: issuer.classicAddress,
      SetFlag: AccountSetAsfFlags.asfDefaultRipple,
    },
    { config },
  );
  const token: LedgerConfig = {
    ...config,
    XRPL_TOKEN_ISSUER: issuer.classicAddress,
    XRPL_TOKEN_CURRENCY: "TST",
  };
  await Promise.all([vault, b].map((w) => ensureTrustLine(client, w, token)));
  const pay = (from: Wallet, to: string, value: number) =>
    submitTx(
      client,
      from,
      {
        TransactionType: "Payment",
        Account: from.classicAddress,
        Destination: to,
        Amount: tokenAmount(token, value),
      },
      { config: token },
    );
  await attempt("11. B (trust line, zero balance) pays the vault 1 token", "tecPATH_DRY", () =>
    pay(b, vault.classicAddress, 1),
  );
  await pay(issuer, vault.classicAddress, 10);
  await attempt("12. Vault pays C, who has no trust line, 1 token", "tecPATH_DRY", () =>
    pay(vault, c.classicAddress, 1),
  );
  const iouNft = nftIdOf(await mint(client, vault, "iou"));
  const iouOffer = offerIdOf(await sellOffer(client, vault, iouNft, tokenAmount(token, 5)));
  await attempt("13. B (zero balance) accepts a 5 token sell offer", "tecINSUFFICIENT_FUNDS", () =>
    accept(client, b, iouOffer),
  );

  const link = (row: Row) =>
    row.hash && row.onLedger
      ? `[${row.hash.slice(0, 8)}](${explorerTxUrl(config, row.hash)})`
      : "not in a ledger";
  const table = [
    `Run ${new Date().toISOString()} on ${config.XRPL_NETWORK_URL}.`,
    `Vault ${vault.classicAddress}, B ${b.classicAddress}, C ${c.classicAddress}, core NFT [${nftId.slice(0, 8)}](${explorerNftUrl(config, nftId)}).`,
    "",
    "| Step | Expected | Actual | Thrown | Transaction |",
    "|---|---|---|---|---|",
    ...rows.map(
      (r) => `| ${r.step} | \`${r.expected}\` | \`${r.actual}\` | ${r.error || "-"} | ${link(r)} |`,
    ),
  ];
  process.stdout.write(table.join("\n") + "\n");
}

try {
  await main();
} catch (error) {
  log(error);
  process.exitCode = 1;
} finally {
  await disconnect();
}
