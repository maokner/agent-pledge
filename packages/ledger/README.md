# @agent-pledge/ledger

XRPL testnet ledger package for Agent Pledge: RLUSD payments, task NFTs, claim locks, payout swaps, and refunds.
See the root README sections 5.1 to 5.4 for the design.
This file documents the core (config, client, submission, events, memos, wallets, explorer links, and typed errors) and the task operations in `src/ops/` (issues 4 to 10).

## Contents

- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Quick start for the server](#quick-start-for-the-server)
- [API](#api)
- [Task operations](#task-operations)
- [Events](#events)
- [Typed errors](#typed-errors)
- [Spike results](#spike-results)
- [Notes for the ops code](#notes-for-the-ops-code)

## Environment variables

`loadConfig()` reads these.
An empty value (for example `XRPL_VAULT_SEED=` in a `.env` file) counts as unset.
A bad value throws a `ConfigError` that names every bad variable.

| Variable                 | Default                                              | Meaning                                                               |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `XRPL_NETWORK_URL`       | `wss://s.altnet.rippletest.net:51233`                | XRPL WebSocket URL.                                                   |
| `XRPL_EXPLORER_URL`      | `https://testnet.xrpl.org`                           | Base of every explorer link.                                          |
| `XRPL_TOKEN_ISSUER`      | `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` (RLUSD testnet) | Issuer of the payment token. Override it for a self-issued token.     |
| `XRPL_TOKEN_CURRENCY`    | `524C555344000000000000000000000000000000` ("RLUSD") | Currency code: 3 characters or 40 hex characters.                     |
| `XRPL_VAULT_SEED`        | unset                                                | Vault seed. Only the server holds it.                                 |
| `XRPL_AGENT_SEED`        | unset                                                | Local agent seed. Only the local agent holds it.                      |
| `XRPL_REQUESTER_SEED`    | unset                                                | Demo requester seed from the setup script.                            |
| `XRPL_TOKEN_ISSUER_SEED` | unset                                                | Seed of a self-issued token issuer, to issue more of the token later. |
| `PUBLIC_BASE_URL`        | `http://localhost:3000`                              | Public server URL, for NFT URIs and the board link.                   |

Never commit seeds.
The root `.gitignore` ignores `.env` and `.env.*` (except `.env.example`), so `packages/ledger/.env.testnet` from the setup script is ignored.
To load it into a shell: `set -a; . packages/ledger/.env.testnet; set +a`.

## Scripts

| Script        | What it does                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `setup`       | Creates and funds the vault, agent, and requester wallets. See below.                                    |
| `spike`       | The open NFT offer spike from issue 2.                                                                   |
| `demo`        | The success, failure, and double-claim flows on fixture wallets, or on the live wallets with `--live`.   |
| `transfer`    | Moves the token between the live wallets: `run transfer requester agent 5`.                              |
| `claim-rlusd` | Claims 10 testnet RLUSD for a live wallet with a tryrlusd.com session cookie.                            |

Live mode runs the demo on the real vault, agent, and requester from `.env.testnet` with real RLUSD.
Helper wallets are still made fresh from the faucet, and anything a helper earns is swept back to the requester at the end.
The requester and the agent each need 5 RLUSD for one run.
The failure flow returns every RLUSD, so use it for rehearsals.
The success flow moves 4 RLUSD to the helper and then sweeps it back, so it also returns everything.

```
set -a; . packages/ledger/.env.testnet; set +a
pnpm ledger:demo failure --live
```

On 2026-10-11 the live failure flow passed on the real wallets with real RLUSD: 10 transactions, requester 5 to 6, agent 5 to 4.

Use `pnpm --filter @agent-pledge/ledger run <script>`, with `run`.
Without `run`, `pnpm ... setup` starts pnpm's own built-in `setup` command, which changes your shell profile.

### setup (issue 1)

```sh
pnpm --filter @agent-pledge/ledger run setup
```

The script creates the vault, local agent, and demo requester wallets and funds each with XRP from the testnet faucet.
Then it sets the token trust lines and tries to get RLUSD from the web faucet at tryrlusd.com.
If the faucet fails, the script falls back to a self-issued token.
At the end it sends a 1-token test payment from the requester to the vault.

The seeds go only to the env file, by default `packages/ledger/.env.testnet`, with file mode 600.
Stdout gets only the wallet addresses and explorer links, so a projected or recorded terminal never shows a seed.
Progress goes to stderr.

The script protects funded wallets:

- It refuses to overwrite an existing env file without `--force`, and it checks this before it spends faucet funds.
  An old file can hold the only copy of a funded vault seed.
- It writes the file as soon as the wallets exist, and again after each step.
  If a later step fails, it still writes the file (with a `# SETUP DID NOT FINISH` line), so the faucet XRP and any token are never stranded.
  If even the file cannot be written, it prints the env block to stdout as a last resort.
- It sets mode 600 also on a file that it replaces with `--force`.
- It warns when the file does not match a `.gitignore` pattern (checked with `git check-ignore`).

| Flag              | Meaning                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| (none)            | RLUSD from tryrlusd.com. If that fails, self-issue.                                              |
| `--rlusd`         | RLUSD only. Fail if the faucet fails.                                                            |
| `--self-issue`    | Skip RLUSD and self-issue at once.                                                               |
| `--amount N`      | Token amount for the requester and the agent. Default 100.                                       |
| `--currency CODE` | Self-issued currency code. Default `USD`.                                                        |
| `--out FILE`      | Write the env block to this file instead of `packages/ledger/.env.testnet`.                      |
| `--force`         | Overwrite the env file if it exists.                                                             |
| `--print-seeds`   | Also print the env block, with the seeds, to stdout. Use it only when nobody can see the screen. |

The RLUSD faucet: the tryrlusd.com page sends `POST /api/mint-xrpl` with `{"address": "r..."}`.
Each call gives 10 RLUSD.
The limit is one claim per GitHub account every 24 hours, not per address, so the team gets 10 RLUSD a day in total.
`pnpm --filter @agent-pledge/ledger run claim-rlusd requester` claims for one wallet with `TRYRLUSD_SESSION_COOKIE` set.
On 2026-10-11 this path worked with a real session cookie: the requester received 10 RLUSD.
The API needs a GitHub login session (NextAuth), so a plain request gets `401 Authentication required`.
To use it from the script, sign in at https://tryrlusd.com in a browser and copy the session cookie.
Then set `TRYRLUSD_SESSION_COOKIE="__Secure-next-auth.session-token=..."` before you run the script.
We did not test this path with a real session cookie.
Without the cookie, the script uses the self-issue fallback.

The self-issue fallback (PRD section 11) makes a new issuer account and sets `asfDefaultRipple` on it.
Without this flag, holders cannot pay each other in the token.
It also sets `asfAllowTrustLineLocking`, so the token also works with native Token Escrow (XLS-85).
The TokenEscrow amendment is enabled on testnet.
Then it sets the trust lines and issues the token.
It prints `XRPL_TOKEN_ISSUER` and `XRPL_TOKEN_CURRENCY` overrides.
The rest of the package reads the token from config and does not change for either token.

The run on 2026-10-11 took 40 seconds (faucet 401, then self-issue):

| Wallet                                                           | Address                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Vault                                                            | [rGK7CqKpenitEQXMeXG6zA1CDCJrRWHZAf](https://testnet.xrpl.org/accounts/rGK7CqKpenitEQXMeXG6zA1CDCJrRWHZAf) |
| Local agent                                                      | [rfd52orC5XNG68sHYNT58Ld41aVWgcZ5nw](https://testnet.xrpl.org/accounts/rfd52orC5XNG68sHYNT58Ld41aVWgcZ5nw) |
| Demo requester                                                   | [rsXnMkA3FvP6sXXwm2USkb4Ed1vcamcZMM](https://testnet.xrpl.org/accounts/rsXnMkA3FvP6sXXwm2USkb4Ed1vcamcZMM) |
| Token issuer (`USD`, DefaultRipple and AllowTrustLineLocking on) | [rK5hgFwTFprL6eaonsoknSuW6kzTiwZhnh](https://testnet.xrpl.org/accounts/rK5hgFwTFprL6eaonsoknSuW6kzTiwZhnh) |

Test payment of 1 USD from the requester to the vault, with the task memo `setup-check`: [02F46CC8](https://testnet.xrpl.org/transactions/02F46CC8DF0519C0B25DA66B8CB870418987538B357ABB3A060F808400A27176).

### demo (issue 9)

```sh
pnpm ledger:demo success       # from the repository root
pnpm ledger:demo failure
pnpm ledger:demo double-claim
```

The root script runs `pnpm --filter @agent-pledge/ledger demo`.
Each run makes fresh faucet wallets and a self-issued stand-in token (`TSTUSD`) and runs the PRD 5.4 sequence on testnet.
It prints an explorer link and a timing for every transaction, and checks every final balance against PRD 2.2 and 2.3.
It prints `PASS: <mode>` and exits 0, or `FAIL` and exits 1.
Each NFT and its sell offer come from one `NFTokenMint` with `Amount`, which saves one ledger per NFT.

### spike (issue 2)

```sh
pnpm --filter @agent-pledge/ledger run spike
```

The script uses fresh faucet wallets, so it does not touch the demo wallets.
It prints a Markdown results table to stdout.
See [Spike results](#spike-results).

## Quick start for the server

```ts
import {
  getClient,
  loadConfig,
  ledgerEvents,
  submitTx,
  walletFromSeed,
  taskMemo,
  tokenAmount,
} from "@agent-pledge/ledger";

const config = loadConfig();
const client = await getClient(config);
const vault = walletFromSeed(config.XRPL_VAULT_SEED!);

// Forward ledger events to the board.
ledgerEvents.on("tx.pending", (e) => board.broadcast({ type: "tx.pending", ...e }));
ledgerEvents.on("tx.validated", (e) => board.broadcast({ type: "tx.validated", ...e }));
ledgerEvents.on("tx.failed", (e) => board.broadcast({ type: "tx.failed", ...e }));
ledgerEvents.on("tx.unknown", (e) => board.broadcast({ type: "tx.unknown", ...e }));
```

`submitTx` returns after the transaction is validated, but `tx.pending` fires as soon as the hash is known (in less than 1 s).
Thus, the board can show "pending" during the 3 to 5 seconds a testnet ledger takes.
The server does not have to wait on the HTTP call to show progress.

## API

Every export comes from `src/index.ts`.
Shared event and error types come from `@agent-pledge/shared`.

### Config

```ts
// loadConfig(env?: NodeJS.ProcessEnv): LedgerConfig
const config = loadConfig(); // reads process.env; throws ConfigError on bad values

// isValidCurrencyCode(code: string): boolean
isValidCurrencyCode("USD"); // true
isValidCurrencyCode("RLUSD"); // false: a 5-character code must be 40 hex characters

// Constants
RLUSD_TESTNET_ISSUER; // "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV"
RLUSD_CURRENCY; // "524C555344000000000000000000000000000000"
```

### Client

```ts
// getClient(config?: LedgerConfig, options?: { timeoutMs?: number }): Promise<Client>
const client = await getClient(config);
```

`getClient` returns one shared, connected xrpl.js `Client`.
After a drop, it reconnects by itself with exponential backoff and jitter (0.5 s up to 15 s) and goes on until `disconnect()`.
A call during a drop waits for the reconnect.
It throws `NetworkError` after `timeoutMs` (default 20 s), and the retries go on in the background.
On testnet, a killed socket (close code 1006) reconnected in about 250 ms.

```ts
// ensureConnected(client: Client, options?: { timeoutMs?: number }): Promise<void>
await ensureConnected(client); // join the shared reconnect loop, or retry connect() for another client

// disconnect(): Promise<void>
await disconnect(); // stop reconnecting and close; call it at the end of scripts

// backoffDelay(attempt: number, random?: () => number): number
backoffDelay(3); // 2000 to 4000 ms
```

Close the shared client with `disconnect()` from this package, not with `client.disconnect()`.
The package treats any other close as a drop and reconnects.

### Submitting transactions

```ts
// submitTx<T>(client, wallet, tx: T, options?: SubmitOptions): Promise<TxResponse<T>>
const response = await submitTx(
  client,
  vault,
  { TransactionType: "NFTokenBurn", Account: vault.classicAddress, NFTokenID: nftId },
  { kind: "nft.burn", taskId: task.id },
);
```

`SubmitOptions`:

| Option                       | Meaning                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `kind?: TxKind`              | Board meaning, copied into the events. Without it, events have `kind: null`.                           |
| `taskId?: string` | Appends the task memo to `Memos`, unless the transaction already has it. A different task memo throws `INVALID_INPUT`. Events then carry `taskId`. |
| `config?: LedgerConfig`      | For explorer links. Default `loadConfig()`.                                                            |
| `pollIntervalMs?: number`    | How often to ask for the outcome. Default 1000.                                                        |
| `outcomeDeadlineMs?: number` | How long to keep trying to learn the outcome while the connection is down. Default 180000 (3 minutes). |

What `submitTx` does:

1. It waits for a connection, autofills (`Fee`, `Sequence`, `LastLedgerSequence` = current + 20), and signs.
2. It emits `tx.pending` with the hash.
3. It submits.
   A preliminary `tem`, `tef`, or `tel` result fails at once, because those transactions never reach a ledger.
   A preliminary `ter` result (for example `terQUEUED` or `terINSUF_FEE_B`) is not final: the server holds the transaction and can still apply it in a later ledger.
4. It polls by hash until a validated ledger has the transaction, or the validated ledger passes `LastLedgerSequence` (then `TxExpiredError`).
5. If the socket drops while it waits, it waits for the reconnect and goes on polling, because a signed transaction can still validate.
6. On `tesSUCCESS` it emits `tx.validated` and returns.
   Any other result emits `tx.failed` and throws the typed error.
7. If the connection stays down for longer than `outcomeDeadlineMs`, the outcome is unknown.
   Then it emits `tx.unknown`, not `tx.failed`, and throws a `NetworkError` with `hash` set.
   The transaction can still validate and move money, so look up the hash before you build it again.

Steps 1 to 3 run under a lock for each account.
Thus, many concurrent `submitTx` calls from the vault get different `Sequence` numbers.
After a `tes` or `tec` preliminary result, the open ledger has used the `Sequence`, so the lock ends before step 4.
After a `ter` result, or an unknown result after a reconnect, the open ledger still has the old `Sequence`.
Then the lock stays held through step 4, until the transaction validates or expires, so the next autofill cannot sign a second transaction with the same `Sequence`.
Different accounts still submit in parallel.
The lock is for one process only, so only one process may sign for each account.

```ts
// resultCode(response: TxResponse): string
resultCode(response); // "tesSUCCESS"

// errorForResult(code, tx, account, cause?, hash?, kind?): LedgerError  (pure, used by submitTx)
errorForResult("tecOBJECT_NOT_FOUND", acceptTx, helper.classicAddress); // AlreadyClaimedError

// RESULT_CODE_ERRORS: the code lists behind the mapping, see "Typed errors"
```

### Memos

Every Agent Pledge transaction carries hex-encoded memos, so anyone can audit the vault history on the explorer (PRD 5.2).
One codec writes and reads all of them.

| Field       | MemoType                  | Value                                              |
| ----------- | ------------------------- | -------------------------------------------------- |
| `task`      | `agent-pledge/task`       | Task ID. For a sub-task op, the parent task ID.    |
| `subtask`   | `agent-pledge/subtask`    | Sub-task ID.                                       |
| `parentNft` | `agent-pledge/parent-nft` | The task NFT ID, on a sub-task mint.               |
| `action`    | `agent-pledge/action`     | The `TxKind`, for example `task.fund` or `refund`. |
| `proof`     | `agent-pledge/proof`      | sha256 (64 hex, lower case) of the proof photo, on payout transactions. |

```ts
// buildMemos(fields: MemoFields): Memo[]
buildMemos({ task: "t1", subtask: "t1-s1", action: "subtask.fund" }); // fixed order, undefined fields left out

// readMemos(memos: unknown): MemoFields
readMemos(tx.Memos); // { task: "t1", subtask: "t1-s1", action: "subtask.fund" }; unknown memos ignored

// taskMemo(taskId: string): Memo[], the same as buildMemos({ task: taskId })
const memos = taskMemo("task_42");
// [{ Memo: { MemoType: hex("agent-pledge/task"), MemoData: hex("task_42"), MemoFormat: hex("text/plain") } }]

// readTaskMemo(tx: object): string | null
readTaskMemo(response.result); // "task_42"; also takes a tx, a tx response, or a stream message

// encodeMemo(type, data): Memo, toHex(text): string, fromHex(hex): string | null
toHex("hi"); // "6869"

// MEMO_TYPES, TASK_MEMO_TYPE = "agent-pledge/task"
```

Every memo has `MemoFormat` `text/plain`.
`buildMemos` (and so `taskMemo`) throws a `LedgerError` with code `INVALID_INPUT` for an empty value, or for a task or sub-task ID with outer whitespace or longer than 256 bytes.
It also throws `INVALID_INPUT` for a `proof` that is not exactly 64 hex characters (`checkProofSha256`), and writes the proof in lower case.
The explorer shows the memos decoded on the Detailed tab of the transaction.

### Wallets

```ts
// createWallet(client, config, options?: { attempts?, xrpAmount?, trustLimit? }): Promise<WalletInfo>
const helper = await createWallet(client, config); // { address, seed }: funded, with a token trust line

// createFundedWallet(client, options?: { attempts?, xrpAmount? }): Promise<Wallet>
const wallet = await createFundedWallet(client); // faucet XRP only

// ensureTrustLine(client, wallet, config, limit = "1000000"): Promise<void>
await ensureTrustLine(client, wallet, config); // no transaction when the line already exists

// walletFromSeed(seed: string): Wallet
const agent = walletFromSeed(config.XRPL_AGENT_SEED!);

// accountExists(client, address): Promise<boolean>
await accountExists(client, "r..."); // in the validated ledger

// waitForAccount(client, address, timeoutMs = 20000): Promise<void>
await waitForAccount(client, address); // NotFoundError after the timeout
```

`createFundedWallet` tries the faucet up to 4 times with backoff, and uses one wallet for all tries.
Thus, a try that funded the account but timed out is not wasted.
It returns only after the account exists in a validated ledger.
On testnet, `createWallet` takes 9 to 11 seconds.

### Amounts

```ts
// tokenAmount(config, value: string | number): IssuedCurrencyAmount
tokenAmount(config, 5); // { currency, issuer, value: "5" } of the configured token

// getTokenBalance(client, config, address): Promise<string>
await getTokenBalance(client, config, vault.classicAddress); // "12.5"; "0" without a trust line

// Exact decimal math for token values. Floats are rejected, and values must be non-negative.
formatIouValue("5.00"); // "5"
addIouValues("5", "1"); // "6"
subtractIouValues("6", "1"); // "5"; throws RangeError if negative
compareIouValues("4.5", "4.50"); // 0
normalizeLedgerValue("1e-7"); // "0.0000001", for values as the ledger returns them
```

### Explorer links

```ts
explorerTxUrl(config, hash); // https://testnet.xrpl.org/transactions/<hash>
explorerAccountUrl(config, address); // https://testnet.xrpl.org/accounts/<address>
explorerNftUrl(config, nftId); // https://testnet.xrpl.org/nft/<nftId>

// explorerUrl(target, config = loadConfig()): string
explorerUrl({ tx: hash });
explorerUrl({ nft: nftId });
explorerUrl({ account: address });
```

A transaction hash and an NFT ID are both 64 hex characters, so `explorerUrl` needs the caller to name the kind.
We took the routes from the explorer source (`ripple/explorer`, `src/containers/App/routes.ts`) and opened each kind of link on testnet.xrpl.org.
The transaction page has `/detailed` and `/raw` tabs.
The NFT page lists the full NFT history and shows "BURNED" after a burn.

## Task operations

Every op takes an input object and an optional `ctx: Partial<OpsContext>` (`{ client, config, pollIntervalMs }`, default: the shared client and `loadConfig()`).
Every op waits for a validated ledger and returns a `SubmittedTx` (`hash`, `kind`, `status`, `explorerUrl`), or throws a typed error.
The `tx.pending` event fires as soon as the hash is known.
Every op writes the memos above and passes the task ID to `submitTx`, so every `tx.*` event of an op has `taskId`.
Amounts are decimal strings in the configured token (`"5"`, `"4.50"`), a bigint, or a safe integer.

The examples follow the demo: requester price 5, pledge 1, sub-task 4.

### Task (demo steps 5 and 7)

```ts
// fundTask({ requester, vault, amount, taskId }): Promise<SubmittedTx>
await fundTask({ requester, vault, amount: "5", taskId }); // Payment requester -> vault, kind task.fund

// mintTaskNftWithOffer({ vault, uri, taskId, pledgeAmount, agentAddress }): Promise<MintOfferResult>
const task = await mintTaskNftWithOffer({
  vault,
  uri: `${base}/api/nft/tasks/${taskId}`,
  taskId,
  pledgeAmount: "1",
  agentAddress: agent.classicAddress,
}); // { nftId, offerId, ... }: one NFTokenMint with Amount and Destination, kind task.mint

// The same in two transactions:
// mintTaskNft({ vault, uri, taskId }): Promise<MintResult>
const nft = await mintTaskNft({ vault, uri, taskId }); // { nftId, ... }, kind task.mint
// offerTaskToAgent({ vault, nftId, pledgeAmount, agentAddress, taskId }): Promise<OfferResult>
const offer = await offerTaskToAgent({
  vault,
  nftId: nft.nftId,
  pledgeAmount: "1",
  agentAddress,
  taskId,
});

// acceptOffer({ claimer, offerId, kind?, taskId, subtaskId? }): Promise<ClaimResult>
await acceptOffer({ claimer: agent, offerId: task.offerId, taskId }); // kind task.claim, pays the pledge
```

Every NFT has exactly the flags `tfBurnable` and `tfTransferable` (`TASK_NFT_FLAGS`), never `tfTrustLine`, and `TransferFee` 0.
`acceptOffer` throws `AlreadyClaimedError` when another account accepted the offer first.
`taskId` is required on `offerTaskToAgent` and `acceptOffer`, because `failTask` finds the pledge by the task memo on the vault's offer.

### Sub-task (demo steps 8 and 10)

```ts
// fundSubtask({ agent, vault, amount, subtaskId, taskId }): Promise<SubmittedTx>
await fundSubtask({ agent, vault, amount: "4", subtaskId, taskId }); // kind subtask.fund

// mintSubtaskNftWithOffer({ vault, uri, subtaskId, taskId, parentNftId, amount? }): Promise<MintOfferResult>
const sub = await mintSubtaskNftWithOffer({
  vault,
  uri,
  subtaskId,
  taskId,
  parentNftId: task.nftId,
});
// one NFTokenMint with Amount "0" XRP drops and no Destination, kind subtask.mint

// The same in two transactions:
// mintSubtaskNft({ vault, uri, subtaskId, taskId, parentNftId }): Promise<MintResult>
const subNft = await mintSubtaskNft({ vault, uri, subtaskId, taskId, parentNftId: task.nftId });
// offerSubtaskToAnyone({ vault, nftId, subtaskId, taskId, amount? }): Promise<OfferResult>
const open = await offerSubtaskToAnyone({ vault, nftId: subNft.nftId, subtaskId, taskId });

// The helper claims:
await acceptOffer({
  claimer: helper,
  offerId: sub.offerId,
  kind: "subtask.claim",
  taskId,
  subtaskId,
});
```

`taskId` (the parent task) and `parentNftId` are required.
`parentNftId` must be 64 hex characters, or the op throws `INVALID_INPUT` before it signs.
The open offer price defaults to `OPEN_OFFER_AMOUNT` (`"0"` XRP drops).
A zero token amount throws a `TypeError` before signing, because rippled rejects it with `temBAD_AMOUNT`.

### Payout (demo step 13)

```ts
// redeem({ holder, vault, nftId, amount, taskId?, subtaskId?, proofSha256? }): Promise<RedeemResult>
await redeem({ holder: helper, vault, nftId: sub.nftId, amount: "4", taskId, subtaskId, proofSha256 }); // { offer, accept }

// The same in two calls, for example when the holder's wallet signs elsewhere:
// createPayoutOffer({ holder, vaultAddress, nftId, amount, taskId?, subtaskId?, proofSha256? }): Promise<OfferResult>
const payout = await createPayoutOffer({
  holder: agent,
  vaultAddress,
  nftId: task.nftId,
  amount: "6",
  taskId,
});
// acceptPayoutOffer({ vault, offerId, nftId, holderAddress, amount, taskId?, subtaskId?, proofSha256? }): Promise<SubmittedTx>
await acceptPayoutOffer({
  vault,
  offerId: payout.offerId,
  nftId: task.nftId,
  holderAddress: agent.classicAddress,
  amount: "6",
  taskId,
});

// burnNft({ vault, nftId, owner?, taskId?, subtaskId? }): Promise<SubmittedTx>
await burnNft({ vault, nftId: task.nftId, taskId }); // Owner is set only if someone other than the vault holds it
```

`acceptPayoutOffer` never signs an offer that it has not checked.
It reads the NFT's sell offers from the validated ledger (`nft_sell_offers`).
It checks that the offer with `offerId` exists for `nftId`, is owned by `holderAddress`, has the vault as `Destination`, and asks exactly `amount` of the configured token (currency, issuer, and value).
Any difference throws `OfferMismatchError` (`OFFER_MISMATCH`) with every problem, and nothing is submitted.
An offer cannot change after it is created, so the check stays true until the accept.
The PIN check (PRD R4 and R8) is not in this package: the server must check the PIN before it calls `redeem` or `acceptPayoutOffer`.

`createPayoutOffer`, `acceptPayoutOffer`, and `redeem` take an optional `proofSha256`: the sha256 (64 hex characters) of the proof photo that released the payout.
They write it as the `agent-pledge/proof` memo on both the holder's sell offer and the vault's accept, so the explorer shows which photo paid the helper.
A malformed hash throws `INVALID_INPUT` before anything is signed.
`XrplLedgerPort.createRedeemOffer` and `acceptRedeemOffer`, and the agent ledger's `createRedeemOffer`, pass `ctx.proofSha256` through.

With a `taskId`, `createPayoutOffer`, `acceptPayoutOffer`, and `redeem` run under the task lock, the same one as `failTask` (see below).
`burnNft` does not take the lock, because `failTask` calls it under the lock.

### Failure (PRD 2.3)

```ts
// failTask(input: FailTaskInput, ctx?): Promise<FailTaskResult>
const result = await failTask({
  vault,
  taskId,
  taskNftId: task.nftId,
  requesterAddress: requester.classicAddress,
  price: "5", // what the caller expects the vault received; "0" if the funding never validated
  pledge: "1", // "0" if the agent never claimed
  agentAddress: agent.classicAddress,
  subtasks: [{ subtaskId, nftId: sub.nftId, amount: "4", helperAddress: helper.classicAddress }],
});
// { burns: FailTaskTx[], refunds: FailTaskTx[], skipped: string[] }; each tx has a plain-English label
```

What `failTask` does:

1. It reads the vault's complete validated history (`listCompleteAccountHistory`): every page of `account_tx`, back to the transaction that created the vault.
   If the server does not have that far back, it throws `HISTORY_INCOMPLETE` and sends nothing.
   There is no option to scan a shorter range, because a skipped old refund would be paid again.
2. It derives what the vault received for the task from that history, in the configured token, by delivered amount.
   The price comes from the requester's `task.fund` payments.
   The pledge comes from the validated accept of the vault's token-priced task offer.
   Each sub-task amount comes from the agent's `subtask.fund` payments.
3. It compares that with `price`, `pledge`, and each sub-task `amount`.
   Any difference, or a funded sub-task missing from `subtasks`, throws `FundingMismatchError` (`FUNDING_MISMATCH`), and nothing is sent.
   The error has `problems` (one line each) and `received` (the ledger's view), so the server can decide and call again.
4. If the vault already bought back any of the NFTs in a payout swap, it throws `ALREADY_PAID_OUT`.
5. It burns every NFT that is not burned yet, from its current holder.
   If no candidate holds an NFT, it throws `NFT_HOLDER_UNKNOWN`.
   A burn that fails with `tecNO_ENTRY` means that the NFT was burned or moved, so it reads the history again.
   A payout of the NFT then throws `ALREADY_PAID_OUT`, a burn counts as done, and anything else rethrows.
6. It reads the history again and plans the refunds from that read.
   A burned NFT can never be paid out, so this view is final.
   Thus, a payout that validated before a burn stops the call here with `ALREADY_PAID_OUT`, before any refund.
7. It refunds the requester the received price plus the received pledge, and the agent each received sub-task amount, with `refund` action memos.
   A refund counts as sent only up to the total token value of the validated refunds to that destination with the same task and sub-task memos.
   If less was sent before, it sends only the rest.

A second call sends nothing and lists each step in `skipped`.
Calls for the same vault and task in one process run one after another, and never at the same time as a payout of that task (`taskLockKey(vault, taskId)` with `runExclusive`).

Idempotency sees only validated ledgers.
A refund that a crashed process submitted in its last few seconds is not in the history yet, so a retry right after the crash could send it again.
After a crash, wait at least one ledger (about 5 seconds, or until the `LastLedgerSequence` of the last transaction has passed) before you call `failTask` again.
The locks are in-process, so only one process may sign for the vault.

`planFailTask(input, state)` is the pure planner behind `failTask`.
`vaultStateFromHistory(vaultAddress, history, config)` builds its `state`: burned and paid-out NFTs, deposits, and refunds.

### Token transfer

```ts
// transferToken({ from, to, amount, taskId? }): Promise<SubmittedTx>
await transferToken({ from: treasury, to: requester.classicAddress, amount: "5", taskId });
// Payment of the configured token, kind token.transfer
```

PRD 5.1 says that the server makes the requester's wallet.
The server uses `transferToken` to put the task money into that wallet before `fundTask`, from a treasury wallet or the vault.
`failTask` ignores token transfers, because they are not task funding.

### Ledger state

```ts
// listAccountTransactions(client, address, { pageSize? }): Promise<LedgerTxRecord[]>, newest first, all pages
// listCompleteAccountHistory(client, address, { pageSize? }): the same, or HISTORY_INCOMPLETE
const history = await listCompleteAccountHistory(client, vault.classicAddress);
// LedgerTxRecord: hash, type, account, destination, result, nftId, amount, offerId, createdAccount, memos

// findNftHolder(client, nftId, candidates): Promise<string | undefined>
await findNftHolder(client, nftId, [vault.classicAddress, helper.classicAddress]);
// accountHoldsNft(client, address, nftId): Promise<boolean>

// tokenValueOf(amount, config): string | undefined, the value if the amount is the configured token
```

For a payment, `LedgerTxRecord.amount` is the delivered amount (`meta.delivered_amount`), so a partial payment counts only what arrived.
For an offer, it is the offer `Amount`.
In API v2, `account_tx` names a payment's amount `DeliverMax`.

### Metadata and URIs

```ts
getMintedNftId(meta); // meta.nftoken_id, or xrpl getNFTokenID
getCreatedOfferId(meta); // meta.offer_id, or the CreatedNode NFTokenOffer LedgerIndex
getAcceptedNftId(meta); // meta.nftoken_id, or the deleted offer's NFTokenID
encodeNftUri("https://board.example/api/nft/tasks/t1"); // hex; absolute http, https, or ipfs URL, at most 256 bytes
decodeNftUri(hex);
```

## Events

`ledgerEvents` is the package-wide typed emitter (a `LedgerEventEmitter`).

```ts
const off = ledgerEvents.on("tx.validated", (e) => console.log(e.hash, e.explorerUrl));
ledgerEvents.once("ledger.connected", (e) => console.log("connected to", e.url));
off(); // or ledgerEvents.off("tx.validated", listener)
```

A listener that throws does not stop the other listeners or the ledger call.
The error goes to `console.error`.
Payload types are in `@agent-pledge/shared` (`LedgerEventMap`).

| Event                 | When                                                                                                                                  | Payload                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `tx.pending`          | The transaction is signed and about to go to the network.                                                                             | `hash`, `kind`, `txType`, `account`, `taskId`, `explorerUrl`                                     |
| `tx.validated`        | A validated ledger has it with `tesSUCCESS`.                                                                                          | the same, plus `result` (`"tesSUCCESS"`) and `ledgerIndex`                                       |
| `tx.failed`           | It failed before or after it reached a ledger. It did not apply and never will.                                                       | `hash`, `kind`, `txType`, `account`, `taskId`, `code`, `errorCode`, `message`, `explorerUrl`     |
| `tx.unknown`          | `submitTx` gave up on learning the outcome (the connection stayed down past `outcomeDeadlineMs`). The transaction may still validate. | `hash`, `kind`, `txType`, `account`, `taskId`, `errorCode` (`NETWORK`), `message`, `explorerUrl` |
| `ledger.disconnected` | The WebSocket dropped unexpectedly.                                                                                                   | `url`, `code` (WebSocket close code)                                                             |
| `ledger.connected`    | The client connected, or reconnected after a drop.                                                                                    | `url`, `reconnected`                                                                             |

In `tx.failed`, `code` is the raw XRPL result code (for example `tecOBJECT_NOT_FOUND`).
When there is no result code, `code` is the error code (for example `NETWORK`).
`errorCode` is the stable `LedgerErrorCode`.
`explorerUrl` is a link only for `tec` results, because only those are in a validated ledger.
For results that never reach a ledger (`tem`, `tef`, `tel`, expired), it is `null`.
Errors before signing (for example a bad config) throw without events, because there is no hash yet.

Show `tx.unknown` on the board as "unknown, checking", not as "failed".
`explorerUrl` in `tx.unknown` is always the link for the hash.
The explorer shows the transaction only if it validated.
Every transaction has a `LastLedgerSequence`, so the outcome is final a few ledgers later.
The server can then look up the hash (`tx` request) to settle the state.

## Typed errors

Every error extends `LedgerError` with `code` (a `LedgerErrorCode` from `@agent-pledge/shared`, so a `switch` on it can be exhaustive), `resultCode` (the raw XRPL code, if any), `hash` (if signed), and `cause`.
Switch on `code` or use `instanceof`.
The HTTP status is our suggestion for the server.

| Class                     | `code`               | XRPL result codes                                                                                                                                                                                                                                         | HTTP | Meaning                                                                                                                                                    |
| ------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AlreadyClaimedError`     | `ALREADY_CLAIMED`    | `tecOBJECT_NOT_FOUND` on `NFTokenAcceptOffer`, except `kind: "payout.accept"`                                                                                                                                                                             | 409  | Another account accepted the offer first (spike steps 4 and 6).                                                                                            |
| `InsufficientFundsError`  | `INSUFFICIENT_FUNDS` | `tecUNFUNDED_PAYMENT`, `tecINSUFFICIENT_FUNDS`, `tecUNFUNDED_OFFER`, `tecUNFUNDED`, `tecINSUFFICIENT_PAYMENT`, `tecINSUFFICIENT_RESERVE`, `tecINSUF_RESERVE_LINE`, `tecINSUF_RESERVE_OFFER`, `tecNO_LINE_INSUF_RESERVE`, `tecPATH_PARTIAL`, `tecPATH_DRY` | 402  | Not enough token, XRP, or XRP reserve.                                                                                                                     |
| `NoTrustLineError`        | `NO_TRUST_LINE`      | `tecNO_LINE`, `tecNO_AUTH`                                                                                                                                                                                                                                | 500  | A trust line is missing or not authorized. A setup problem.                                                                                                |
| `NotAllowedError`         | `NOT_ALLOWED`        | `tecNO_PERMISSION`, `tecCANT_ACCEPT_OWN_NFTOKEN_OFFER`, `tefNFTOKEN_IS_NOT_TRANSFERABLE`                                                                                                                                                                  | 403  | The account may not do this (spike step 8).                                                                                                                |
| `NotFoundError`           | `NOT_FOUND`          | `tecNO_ENTRY`, `tecNO_DST`, `tecNO_DST_INSUF_XRP`, `tecNO_TARGET`, and `tecOBJECT_NOT_FOUND` on the vault's payout accept or on transactions other than an offer accept                                                                                   | 404  | The NFT, offer, or destination account does not exist (spike step 10).                                                                                     |
| `OfferExpiredError`       | `OFFER_EXPIRED`      | `tecEXPIRED`                                                                                                                                                                                                                                              | 410  | The NFT offer has expired.                                                                                                                                 |
| `TxExpiredError`          | `TX_EXPIRED`         | `tefMAX_LEDGER`, or `LastLedgerSequence` passed with no result                                                                                                                                                                                            | 503  | It will never apply. You can safely build and send it again. The message names a `ter` preliminary result, for example `terINSUF_FEE_B`, if there was one. |
| `InvalidTransactionError` | `INVALID_TX`         | every `tem*` code, and xrpl.js `ValidationError`                                                                                                                                                                                                          | 500  | Malformed transaction, a bug in our code (spike step 9).                                                                                                   |
| `NetworkError`            | `NETWORK`            | none                                                                                                                                                                                                                                                      | 503  | No connection. If `hash` is set, the outcome is unknown. Check the hash before you retry.                                                                  |
| `ConfigError`             | `CONFIG`             | none                                                                                                                                                                                                                                                      | 500  | An environment variable is missing or invalid.                                                                                                             |
| `LedgerError`             | `INVALID_INPUT`      | none                                                                                                                                                                                                                                                      | 400  | Bad input to a helper, for example an empty task ID.                                                                                                       |
| `FundingMismatchError`    | `FUNDING_MISMATCH`   | none                                                                                                                                                                                                                                                      | 409  | `failTask`: the input amounts differ from what the vault received. Nothing was sent. Has `problems` and `received`.                                        |
| `OfferMismatchError`      | `OFFER_MISMATCH`     | none                                                                                                                                                                                                                                                      | 409  | `acceptPayoutOffer`: the offer is not the expected payout offer. Nothing was submitted. Has `problems`.                                                    |
| `LedgerError`             | `ALREADY_PAID_OUT`   | none                                                                                                                                                                                                                                                      | 409  | `failTask`: an NFT of the task was paid out, so the task did not fail. No refund was sent.                                                                 |
| `LedgerError`             | `NFT_HOLDER_UNKNOWN` | none                                                                                                                                                                                                                                                      | 500  | `failTask`: an NFT is not burned and none of the candidates holds it. No refund was sent.                                                                  |
| `LedgerError`             | `HISTORY_INCOMPLETE` | none                                                                                                                                                                                                                                                      | 503  | `failTask`: the XRPL server lacks the vault's full history. Use a full-history server.                                                                     |
| `LedgerError`             | `META_PARSE`         | none                                                                                                                                                                                                                                                      | 500  | A validated mint or offer has no NFT ID or offer ID in its metadata.                                                                                       |
| `LedgerError`             | `TX_FAILED`          | every other code, and rippled request errors from `submit`                                                                                                                                                                                                | 500  | `resultCode` has the raw code.                                                                                                                             |

What each mapped code means:

- `tecOBJECT_NOT_FOUND`: the ledger object in the transaction does not exist.
  On a claim, this means somebody already accepted the offer, so the offer is deleted.
  On the vault's payout accept (`kind: "payout.accept"`), it means the holder's payout offer is gone, for example because the NFT was burned, so it is a `NotFoundError`.
- `tecUNFUNDED_PAYMENT`: the sender does not have enough XRP to send.
- `tecINSUFFICIENT_FUNDS`: the account does not have enough of the asset, for example a buyer who accepts a 5-token sell offer with 0 tokens (spike step 13).
- `tecUNFUNDED_OFFER`, `tecUNFUNDED`: the offer or the payment is not funded.
- `tecINSUFFICIENT_PAYMENT`: the amount is less than the offer requires.
- `tecINSUFFICIENT_RESERVE`, `tecINSUF_RESERVE_LINE`, `tecINSUF_RESERVE_OFFER`, `tecNO_LINE_INSUF_RESERVE`: not enough XRP for the owner reserve (0.2 XRP for each object on testnet) of a new NFT page, offer, or trust line.
- `tecPATH_PARTIAL`: only part of the amount could be delivered.
- `tecPATH_DRY`: nothing could be delivered.
  On testnet this code means two things: the sender has no token balance (spike step 11), or the receiver has no trust line (spike step 12).
  The error message names both causes.
- `terINSUF_FEE_B` is not in the table on purpose.
  It is a preliminary `ter` result, so it never appears in a validated ledger, and the server holds the transaction and retries it.
  If the account gets XRP before `LastLedgerSequence`, the transaction still applies.
  Thus, `submitTx` waits, and the result is either success or a `TxExpiredError` whose message names `terINSUF_FEE_B`.
- `tecNO_LINE`, `tecNO_AUTH`: the trust line is missing or not authorized by the issuer.
- `tecNO_PERMISSION`: for example, an account accepts an offer whose `Destination` is a different account.
- `tecCANT_ACCEPT_OWN_NFTOKEN_OFFER`: the account tries to accept its own offer.
- `tefNFTOKEN_IS_NOT_TRANSFERABLE`: the NFT was minted without `tfTransferable`.
- `tecNO_ENTRY`: the NFT or offer does not exist, for example a burn of an NFT that is already burned.
- `tecNO_DST`, `tecNO_DST_INSUF_XRP`: the destination account does not exist, or the payment is too small to create it.
- `tecNO_TARGET`: the target object does not exist.
- `tecEXPIRED`: the offer's `Expiration` has passed.
- `tefMAX_LEDGER`: the `LastLedgerSequence` of the transaction has already passed.
- `tem*`: the transaction is malformed, for example a zero amount of an issued token (`temBAD_AMOUNT`).

## Spike results

Issue 2 asked if the XRPL accepts an open NFT sell offer with `Amount` = `"0"` and no `Destination`, and if a second accept fails.
The result: yes to both.
The 1-drop fallback is not necessary.
`pnpm --filter @agent-pledge/ledger run spike` ran on 2026-10-11 against `wss://s.altnet.rippletest.net:51233` (rippled 3.4.1).
Every step gave the expected result.

Wallets: vault [r4pBskTc3tnEHYZoRSXF4QAwQTL7DLsrtV](https://testnet.xrpl.org/accounts/r4pBskTc3tnEHYZoRSXF4QAwQTL7DLsrtV), B [rLEi8FksDuSUxJx3b9TLyApJ5yLw8XPks5](https://testnet.xrpl.org/accounts/rLEi8FksDuSUxJx3b9TLyApJ5yLw8XPks5), C [rsN2CYt6LeXXmyz1uUFya183fPXNHQQAe9](https://testnet.xrpl.org/accounts/rsN2CYt6LeXXmyz1uUFya183fPXNHQQAe9).
Core NFT: [00090000E693...](https://testnet.xrpl.org/nft/00090000E69371CF4F227BB8E101C076ABE8A44E0BF589B4421A52A701477D0C).
Its explorer page shows the mint, the offer, B's accept, and the vault's burn, and marks it "BURNED".

| Step                                                                    | Expected                        | Actual                  | Thrown                  | Transaction                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1. Vault mints NFT with tfBurnable and tfTransferable                   | `tesSUCCESS`                    | `tesSUCCESS`            | -                       | [FB9E5446](https://testnet.xrpl.org/transactions/FB9E544674757E95DB59BA382D89D30938FD28361BA8203C10D7B9196036EA0B) |
| 2. Vault sell offer, Amount "0", no Destination                         | `tesSUCCESS`                    | `tesSUCCESS`            | -                       | [6C8A9598](https://testnet.xrpl.org/transactions/6C8A959810789FEF0937091175F090245319A65305A2AA5DFD1C9F22FC8638C0) |
| 3. B accepts the open offer                                             | `tesSUCCESS`                    | `tesSUCCESS`            | -                       | [CCDBF455](https://testnet.xrpl.org/transactions/CCDBF4550C7D4F313F00B4585AD850CDA7B4A078CA1B5135AF040F4383159286) |
| 4. C accepts the same offer                                             | `tecOBJECT_NOT_FOUND`           | `tecOBJECT_NOT_FOUND`   | AlreadyClaimedError     | [99EDCA81](https://testnet.xrpl.org/transactions/99EDCA81EFA831877A39CED1B81FF7EA87BBD2C54FCEF8EA23E95ADA492E6E41) |
| 5. Vault burns the NFT while B holds it                                 | `tesSUCCESS`                    | `tesSUCCESS`            | -                       | [333E675B](https://testnet.xrpl.org/transactions/333E675B59FBEFA939B742B8580E2AB6655051ABE26EADEFCAAE716CEE47A018) |
| 6a. Race: B accepts                                                     | one of 6a and 6b `tesSUCCESS`   | `tesSUCCESS`            | -                       | [4F125C5A](https://testnet.xrpl.org/transactions/4F125C5A4EBC35B10E7684EB5348C9EC9013B979DB92E8963DAE91A68D2B067A) |
| 6b. Race: C accepts                                                     | the other `tecOBJECT_NOT_FOUND` | `tecOBJECT_NOT_FOUND`   | AlreadyClaimedError     | [6579CEB8](https://testnet.xrpl.org/transactions/6579CEB80CB7ED73F7DD97A9B2EC2E68A31511C06D5340BB290C6273A32EAB61) |
| 7. NFTokenMint with Amount "0" (mint and open offer in one transaction) | `tesSUCCESS`                    | `tesSUCCESS`            | -                       | [EC9AE620](https://testnet.xrpl.org/transactions/EC9AE6205BFC494A7CC669BC2EB9FCD68850DD68C129D9A1A31760A9CDF2C297) |
| 7b. B accepts the offer made by the mint                                | `tesSUCCESS`                    | `tesSUCCESS`            | -                       | [4E4C6101](https://testnet.xrpl.org/transactions/4E4C61011392715584877C936C39FF1DB8162299F9A57FF01F823778110CEBBE) |
| 8. C accepts an offer whose Destination is B                            | `tecNO_PERMISSION`              | `tecNO_PERMISSION`      | NotAllowedError         | [2A73E922](https://testnet.xrpl.org/transactions/2A73E922DA795B92C049C0EA60461CEF4ECBE334CBE81E521F0F290013D8D635) |
| 9. Sell offer with a zero token (IOU) Amount                            | `temBAD_AMOUNT`                 | `temBAD_AMOUNT`         | InvalidTransactionError | not in a ledger                                                                                                    |
| 10. Vault burns an NFT that is already burned                           | `tecNO_ENTRY`                   | `tecNO_ENTRY`           | NotFoundError           | [B5178401](https://testnet.xrpl.org/transactions/B517840159CDDE83B46E56FF446C81F793CC0F995ACBD494351AA8E6502D3CEF) |
| 11. B (trust line, zero balance) pays the vault 1 token                 | `tecPATH_DRY`                   | `tecPATH_DRY`           | InsufficientFundsError  | [3C6E8FF7](https://testnet.xrpl.org/transactions/3C6E8FF7D125C61E130019D86203F79494A1E73C035AF900BAB278CADD08846C) |
| 12. Vault pays C, who has no trust line, 1 token                        | `tecPATH_DRY`                   | `tecPATH_DRY`           | InsufficientFundsError  | [47B16F68](https://testnet.xrpl.org/transactions/47B16F68C9F02E05253A322264E6749F2B2F8A0612EF974B695D2835480C1DD5) |
| 13. B (zero balance) accepts a 5 token sell offer                       | `tecINSUFFICIENT_FUNDS`         | `tecINSUFFICIENT_FUNDS` | InsufficientFundsError  | [4DAC977D](https://testnet.xrpl.org/transactions/4DAC977D90E962AA7B8612DA48177239B9DBF45E73FA78BCF48D949D853CFF7B) |

What we learned:

- An open sell offer with `Amount` = `"0"` (XRP drops) and no `Destination` is valid.
  Any account can accept it for free.
- The ledger accepts only the first accept.
  A second accept, even one sent at the same time, fails with `tecOBJECT_NOT_FOUND` and pays only the fee.
  This is the claim lock for R5.
- The issuer can burn an NFT minted with `tfBurnable` while another account holds it (`NFTokenBurn` with `Owner`).
  The holder then no longer has it.
- A zero amount is legal only in XRP.
  A zero amount of an issued token is `temBAD_AMOUNT`, so a free open offer must use `"0"` drops, not 0 RLUSD.
- With the NFTokenMintOffer amendment (enabled on testnet), `NFTokenMint` with `Amount` (and an optional `Destination`) makes the NFT and its sell offer in one transaction.
  This saves one ledger (3 to 5 seconds) for each task and each sub-task.

## Notes for the ops code

- Get the NFT ID from `meta.nftoken_id` of the validated mint (rippled 1.11 or later).
  The fallback is `getNFTokenID(meta)` from xrpl.js.
- Get the offer ID from `meta.offer_id` of `NFTokenCreateOffer`, or of `NFTokenMint` with `Amount`.
  The fallback is the `CreatedNode` with `LedgerEntryType` `NFTokenOffer` and its `LedgerIndex`.
- Never set the `tfTrustLine` mint flag.
  The fixRemoveNFTokenAutoTrustLine amendment is on and rejects it.
- Pass `kind` and `taskId` to every `submitTx` call so the board can place each event, and so every vault transaction has the task memo.
  If the transaction already has the same task memo, `submitTx` does not add a second one.
- Send independent transactions with `Promise.all`.
  The account lock keeps the vault's Sequence numbers correct.
- For a payout swap in RLUSD, the seller of the NFT (the helper or the agent) must have a trust line for the token.
