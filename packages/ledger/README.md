# @agent-pledge/ledger

XRPL testnet ledger package for Agent Pledge: RLUSD payments, task NFTs, claim locks, payout swaps, and refunds.
See the root README sections 5.1 to 5.4 for the design.
This file documents the core: config, client, submission, events, memos, wallets, explorer links, and typed errors.
The task operations (issues 4 to 9) live in `src/ops/`.

## Contents

- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Quick start for the server](#quick-start-for-the-server)
- [API](#api)
- [Events](#events)
- [Typed errors](#typed-errors)
- [Spike results](#spike-results)
- [Notes for the ops code](#notes-for-the-ops-code)

## Environment variables

`loadConfig()` reads these.
An empty value (for example `XRPL_VAULT_SEED=` in a `.env` file) counts as unset.
A bad value throws a `ConfigError` that names every bad variable.

| Variable | Default | Meaning |
|---|---|---|
| `XRPL_NETWORK_URL` | `wss://s.altnet.rippletest.net:51233` | XRPL WebSocket URL. |
| `XRPL_EXPLORER_URL` | `https://testnet.xrpl.org` | Base of every explorer link. |
| `XRPL_TOKEN_ISSUER` | `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` (RLUSD testnet) | Issuer of the payment token. Override it for a self-issued token. |
| `XRPL_TOKEN_CURRENCY` | `524C555344000000000000000000000000000000` ("RLUSD") | Currency code: 3 characters or 40 hex characters. |
| `XRPL_VAULT_SEED` | unset | Vault seed. Only the server holds it. |
| `XRPL_AGENT_SEED` | unset | Local agent seed. Only the local agent holds it. |
| `XRPL_REQUESTER_SEED` | unset | Demo requester seed from the setup script. |
| `XRPL_TOKEN_ISSUER_SEED` | unset | Seed of a self-issued token issuer, to issue more of the token later. |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Public server URL, for NFT URIs and the board link. |

Never commit seeds.
The root `.gitignore` ignores `.env` and `.env.*` (except `.env.example`).

## Scripts

Use `pnpm --filter @agent-pledge/ledger run <script>`, with `run`.
Without `run`, `pnpm ... setup` starts pnpm's own built-in `setup` command, which changes your shell profile.

### setup (issue 1)

```sh
pnpm --filter @agent-pledge/ledger run setup --out ../../.env.testnet
```

The script creates the vault, local agent, and demo requester wallets and funds each with XRP from the testnet faucet.
Then it sets the token trust lines and tries to get RLUSD from the web faucet at tryrlusd.com.
If the faucet fails, the script falls back to a self-issued token.
At the end it sends a 1-token test payment from the requester to the vault.
It prints the env block to stdout and writes it to `--out` with file mode 600.
Progress goes to stderr.
With `--out`, the env block cannot mix with pnpm's own banner lines on stdout.

| Flag | Meaning |
|---|---|
| (none) | RLUSD from tryrlusd.com. If that fails, self-issue. |
| `--rlusd` | RLUSD only. Fail if the faucet fails. |
| `--self-issue` | Skip RLUSD and self-issue at once. |
| `--amount N` | Token amount for the requester and the agent. Default 100. |
| `--currency CODE` | Self-issued currency code. Default `USD`. |
| `--out FILE` | Also write the env block to this file. |

The RLUSD faucet: the tryrlusd.com page sends `POST /api/mint-xrpl` with `{"address": "r..."}`.
Each call gives 10 RLUSD.
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

| Wallet | Address |
|---|---|
| Vault | [rGK7CqKpenitEQXMeXG6zA1CDCJrRWHZAf](https://testnet.xrpl.org/accounts/rGK7CqKpenitEQXMeXG6zA1CDCJrRWHZAf) |
| Local agent | [rfd52orC5XNG68sHYNT58Ld41aVWgcZ5nw](https://testnet.xrpl.org/accounts/rfd52orC5XNG68sHYNT58Ld41aVWgcZ5nw) |
| Demo requester | [rsXnMkA3FvP6sXXwm2USkb4Ed1vcamcZMM](https://testnet.xrpl.org/accounts/rsXnMkA3FvP6sXXwm2USkb4Ed1vcamcZMM) |
| Token issuer (`USD`, DefaultRipple and AllowTrustLineLocking on) | [rK5hgFwTFprL6eaonsoknSuW6kzTiwZhnh](https://testnet.xrpl.org/accounts/rK5hgFwTFprL6eaonsoknSuW6kzTiwZhnh) |

Test payment of 1 USD from the requester to the vault, with the task memo `setup-check`: [02F46CC8](https://testnet.xrpl.org/transactions/02F46CC8DF0519C0B25DA66B8CB870418987538B357ABB3A060F808400A27176).

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
  getClient, loadConfig, ledgerEvents, submitTx, walletFromSeed, taskMemo, tokenAmount,
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

| Option | Meaning |
|---|---|
| `kind?: TxKind` | Board meaning, copied into the events. Without it, events have `kind: null`. |
| `taskId?: string` | Appends the task memo to `Memos`. Events then carry `taskId`. |
| `config?: LedgerConfig` | For explorer links. Default `loadConfig()`. |
| `pollIntervalMs?: number` | How often to ask for the outcome. Default 1000. |
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

// errorForResult(code, tx, account, cause?, hash?): LedgerError  (pure, used by submitTx)
errorForResult("tecOBJECT_NOT_FOUND", acceptTx, helper.classicAddress); // AlreadyClaimedError

// RESULT_CODE_ERRORS: the code lists behind the mapping, see "Typed errors"
```

### Memos

```ts
// taskMemo(taskId: string): Memo[]
const memos = taskMemo("task_42");
// [{ Memo: { MemoType: hex("agent-pledge/task"), MemoData: hex("task_42"), MemoFormat: hex("text/plain") } }]

// readTaskMemo(tx: object): string | null
readTaskMemo(response.result); // "task_42"; also takes a tx, a tx response, or a stream message

// toHex(text: string): string, fromHex(hex: string): string | null
toHex("hi"); // "6869"

// TASK_MEMO_TYPE = "agent-pledge/task"
```

`taskMemo` throws a `LedgerError` with code `INVALID_INPUT` for an empty ID, an ID with outer whitespace, or an ID longer than 256 bytes.
The explorer shows the memo decoded on the Detailed tab of the transaction.

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

// getTokenBalance(client, address, config): Promise<string>
await getTokenBalance(client, vault.classicAddress, config); // "12.5"; "0" without a trust line
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

| Event | When | Payload |
|---|---|---|
| `tx.pending` | The transaction is signed and about to go to the network. | `hash`, `kind`, `txType`, `account`, `taskId`, `explorerUrl` |
| `tx.validated` | A validated ledger has it with `tesSUCCESS`. | the same, plus `result` (`"tesSUCCESS"`) and `ledgerIndex` |
| `tx.failed` | It failed before or after it reached a ledger. It did not apply and never will. | `hash`, `kind`, `txType`, `account`, `taskId`, `code`, `errorCode`, `message`, `explorerUrl` |
| `tx.unknown` | `submitTx` gave up on learning the outcome (the connection stayed down past `outcomeDeadlineMs`). The transaction may still validate. | `hash`, `kind`, `txType`, `account`, `taskId`, `errorCode` (`NETWORK`), `message`, `explorerUrl` |
| `ledger.disconnected` | The WebSocket dropped unexpectedly. | `url`, `code` (WebSocket close code) |
| `ledger.connected` | The client connected, or reconnected after a drop. | `url`, `reconnected` |

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

Every error extends `LedgerError` with `code` (a `LedgerErrorCode`), `resultCode` (the raw XRPL code, if any), `hash` (if signed), and `cause`.
Switch on `code` or use `instanceof`.
The HTTP status is our suggestion for the server.

| Class | `code` | XRPL result codes | HTTP | Meaning |
|---|---|---|---|---|
| `AlreadyClaimedError` | `ALREADY_CLAIMED` | `tecOBJECT_NOT_FOUND` on `NFTokenAcceptOffer` | 409 | Another account accepted the offer first (spike steps 4 and 6). |
| `InsufficientFundsError` | `INSUFFICIENT_FUNDS` | `tecUNFUNDED_PAYMENT`, `tecINSUFFICIENT_FUNDS`, `tecUNFUNDED_OFFER`, `tecUNFUNDED`, `tecINSUFFICIENT_PAYMENT`, `tecINSUFFICIENT_RESERVE`, `tecINSUF_RESERVE_LINE`, `tecINSUF_RESERVE_OFFER`, `tecNO_LINE_INSUF_RESERVE`, `tecPATH_PARTIAL`, `tecPATH_DRY` | 402 | Not enough token, XRP, or XRP reserve. |
| `NoTrustLineError` | `NO_TRUST_LINE` | `tecNO_LINE`, `tecNO_AUTH` | 500 | A trust line is missing or not authorized. A setup problem. |
| `NotAllowedError` | `NOT_ALLOWED` | `tecNO_PERMISSION`, `tecCANT_ACCEPT_OWN_NFTOKEN_OFFER`, `tefNFTOKEN_IS_NOT_TRANSFERABLE` | 403 | The account may not do this (spike step 8). |
| `NotFoundError` | `NOT_FOUND` | `tecNO_ENTRY`, `tecNO_DST`, `tecNO_DST_INSUF_XRP`, `tecNO_TARGET`, and `tecOBJECT_NOT_FOUND` on transactions other than an offer accept | 404 | The NFT, offer, or destination account does not exist (spike step 10). |
| `OfferExpiredError` | `OFFER_EXPIRED` | `tecEXPIRED` | 410 | The NFT offer has expired. |
| `TxExpiredError` | `TX_EXPIRED` | `tefMAX_LEDGER`, or `LastLedgerSequence` passed with no result | 503 | It will never apply. You can safely build and send it again. The message names a `ter` preliminary result, for example `terINSUF_FEE_B`, if there was one. |
| `InvalidTransactionError` | `INVALID_TX` | every `tem*` code, and xrpl.js `ValidationError` | 500 | Malformed transaction, a bug in our code (spike step 9). |
| `NetworkError` | `NETWORK` | none | 503 | No connection. If `hash` is set, the outcome is unknown. Check the hash before you retry. |
| `ConfigError` | `CONFIG` | none | 500 | An environment variable is missing or invalid. |
| `LedgerError` | `INVALID_INPUT` | none | 400 | Bad input to a helper, for example an empty task ID. |
| `LedgerError` | `TX_FAILED` | every other code, and rippled request errors from `submit` | 500 | `resultCode` has the raw code. |

What each mapped code means:

- `tecOBJECT_NOT_FOUND`: the ledger object in the transaction does not exist.
  On an offer accept, this means somebody already accepted the offer, so the offer is deleted.
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

| Step | Expected | Actual | Thrown | Transaction |
|---|---|---|---|---|
| 1. Vault mints NFT with tfBurnable and tfTransferable | `tesSUCCESS` | `tesSUCCESS` | - | [FB9E5446](https://testnet.xrpl.org/transactions/FB9E544674757E95DB59BA382D89D30938FD28361BA8203C10D7B9196036EA0B) |
| 2. Vault sell offer, Amount "0", no Destination | `tesSUCCESS` | `tesSUCCESS` | - | [6C8A9598](https://testnet.xrpl.org/transactions/6C8A959810789FEF0937091175F090245319A65305A2AA5DFD1C9F22FC8638C0) |
| 3. B accepts the open offer | `tesSUCCESS` | `tesSUCCESS` | - | [CCDBF455](https://testnet.xrpl.org/transactions/CCDBF4550C7D4F313F00B4585AD850CDA7B4A078CA1B5135AF040F4383159286) |
| 4. C accepts the same offer | `tecOBJECT_NOT_FOUND` | `tecOBJECT_NOT_FOUND` | AlreadyClaimedError | [99EDCA81](https://testnet.xrpl.org/transactions/99EDCA81EFA831877A39CED1B81FF7EA87BBD2C54FCEF8EA23E95ADA492E6E41) |
| 5. Vault burns the NFT while B holds it | `tesSUCCESS` | `tesSUCCESS` | - | [333E675B](https://testnet.xrpl.org/transactions/333E675B59FBEFA939B742B8580E2AB6655051ABE26EADEFCAAE716CEE47A018) |
| 6a. Race: B accepts | one of 6a and 6b `tesSUCCESS` | `tesSUCCESS` | - | [4F125C5A](https://testnet.xrpl.org/transactions/4F125C5A4EBC35B10E7684EB5348C9EC9013B979DB92E8963DAE91A68D2B067A) |
| 6b. Race: C accepts | the other `tecOBJECT_NOT_FOUND` | `tecOBJECT_NOT_FOUND` | AlreadyClaimedError | [6579CEB8](https://testnet.xrpl.org/transactions/6579CEB80CB7ED73F7DD97A9B2EC2E68A31511C06D5340BB290C6273A32EAB61) |
| 7. NFTokenMint with Amount "0" (mint and open offer in one transaction) | `tesSUCCESS` | `tesSUCCESS` | - | [EC9AE620](https://testnet.xrpl.org/transactions/EC9AE6205BFC494A7CC669BC2EB9FCD68850DD68C129D9A1A31760A9CDF2C297) |
| 7b. B accepts the offer made by the mint | `tesSUCCESS` | `tesSUCCESS` | - | [4E4C6101](https://testnet.xrpl.org/transactions/4E4C61011392715584877C936C39FF1DB8162299F9A57FF01F823778110CEBBE) |
| 8. C accepts an offer whose Destination is B | `tecNO_PERMISSION` | `tecNO_PERMISSION` | NotAllowedError | [2A73E922](https://testnet.xrpl.org/transactions/2A73E922DA795B92C049C0EA60461CEF4ECBE334CBE81E521F0F290013D8D635) |
| 9. Sell offer with a zero token (IOU) Amount | `temBAD_AMOUNT` | `temBAD_AMOUNT` | InvalidTransactionError | not in a ledger |
| 10. Vault burns an NFT that is already burned | `tecNO_ENTRY` | `tecNO_ENTRY` | NotFoundError | [B5178401](https://testnet.xrpl.org/transactions/B517840159CDDE83B46E56FF446C81F793CC0F995ACBD494351AA8E6502D3CEF) |
| 11. B (trust line, zero balance) pays the vault 1 token | `tecPATH_DRY` | `tecPATH_DRY` | InsufficientFundsError | [3C6E8FF7](https://testnet.xrpl.org/transactions/3C6E8FF7D125C61E130019D86203F79494A1E73C035AF900BAB278CADD08846C) |
| 12. Vault pays C, who has no trust line, 1 token | `tecPATH_DRY` | `tecPATH_DRY` | InsufficientFundsError | [47B16F68](https://testnet.xrpl.org/transactions/47B16F68C9F02E05253A322264E6749F2B2F8A0612EF974B695D2835480C1DD5) |
| 13. B (zero balance) accepts a 5 token sell offer | `tecINSUFFICIENT_FUNDS` | `tecINSUFFICIENT_FUNDS` | InsufficientFundsError | [4DAC977D](https://testnet.xrpl.org/transactions/4DAC977D90E962AA7B8612DA48177239B9DBF45E73FA78BCF48D949D853CFF7B) |

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
- Send independent transactions with `Promise.all`.
  The account lock keeps the vault's Sequence numbers correct.
- For a payout swap in RLUSD, the seller of the NFT (the helper or the agent) must have a trust line for the token.
