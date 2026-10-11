import type { LedgerErrorCode, TxKind } from "@agent-pledge/shared";
import {
  ConnectionError,
  RippledError,
  ValidationError,
  type Client,
  type SubmittableTransaction,
  type TxResponse,
  type Wallet,
} from "xrpl";
import { ensureConnected } from "./client.js";
import { loadConfig, type LedgerConfig } from "./config.js";
import {
  AlreadyClaimedError,
  InsufficientFundsError,
  InvalidTransactionError,
  LedgerError,
  NetworkError,
  NoTrustLineError,
  NotAllowedError,
  NotFoundError,
  OfferExpiredError,
  TxExpiredError,
  type LedgerErrorDetails,
} from "./errors.js";
import { ledgerEvents } from "./events.js";
import { explorerTxUrl } from "./explorer.js";
import { readTaskMemo, taskMemo } from "./memo.js";

/** Reads the engine result code from a validated transaction response. */
export function resultCode(response: TxResponse): string {
  const meta = response.result.meta;
  if (meta && typeof meta === "object" && "TransactionResult" in meta) {
    return String(meta.TransactionResult);
  }
  return "unknown";
}

/** XRPL result codes per typed error. Each code is explained in packages/ledger/README.md. */
export const RESULT_CODE_ERRORS = {
  INSUFFICIENT_FUNDS: [
    "tecUNFUNDED_PAYMENT",
    "tecINSUFFICIENT_FUNDS",
    "tecUNFUNDED_OFFER",
    "tecUNFUNDED",
    "tecINSUFFICIENT_PAYMENT",
    "tecINSUFFICIENT_RESERVE",
    "tecINSUF_RESERVE_LINE",
    "tecINSUF_RESERVE_OFFER",
    "tecNO_LINE_INSUF_RESERVE",
    "tecPATH_PARTIAL",
    "tecPATH_DRY",
    "terINSUF_FEE_B",
  ],
  NO_TRUST_LINE: ["tecNO_LINE", "tecNO_AUTH"],
  NOT_ALLOWED: [
    "tecNO_PERMISSION",
    "tecCANT_ACCEPT_OWN_NFTOKEN_OFFER",
    "tefNFTOKEN_IS_NOT_TRANSFERABLE",
  ],
  NOT_FOUND: ["tecNO_ENTRY", "tecNO_DST", "tecNO_DST_INSUF_XRP", "tecNO_TARGET"],
  OFFER_EXPIRED: ["tecEXPIRED"],
  TX_EXPIRED: ["tefMAX_LEDGER"],
} as const satisfies Partial<Record<LedgerErrorCode, readonly string[]>>;

const CODE_TO_ERROR = new Map<string, keyof typeof RESULT_CODE_ERRORS>(
  Object.entries(RESULT_CODE_ERRORS).flatMap(([error, codes]) =>
    codes.map((code) => [code, error as keyof typeof RESULT_CODE_ERRORS] as const),
  ),
);

function offerIdOf(tx: SubmittableTransaction): string {
  if ("NFTokenSellOffer" in tx && tx.NFTokenSellOffer) return String(tx.NFTokenSellOffer);
  if ("NFTokenBuyOffer" in tx && tx.NFTokenBuyOffer) return String(tx.NFTokenBuyOffer);
  return "";
}

function targetOf(tx: SubmittableTransaction): string {
  if ("NFTokenID" in tx && tx.NFTokenID) return `NFT ${String(tx.NFTokenID)}`;
  if ("Destination" in tx && tx.Destination) return `Account ${String(tx.Destination)}`;
  return `The target of ${tx.TransactionType}`;
}

/**
 * Maps an XRPL result code to a typed LedgerError. Pure: no network, no events.
 * `tecOBJECT_NOT_FOUND` on an offer accept means another account accepted the offer first.
 */
export function errorForResult(
  code: string,
  tx: SubmittableTransaction,
  account: string,
  cause?: unknown,
  hash?: string,
): LedgerError {
  const details: LedgerErrorDetails = { resultCode: code, ...(hash ? { hash } : {}) };
  const offerId = offerIdOf(tx);
  if (code === "tecOBJECT_NOT_FOUND") {
    return offerId
      ? new AlreadyClaimedError(offerId, cause, details)
      : new NotFoundError(targetOf(tx), cause, details);
  }
  switch (CODE_TO_ERROR.get(code)) {
    case "INSUFFICIENT_FUNDS":
      return new InsufficientFundsError(account, cause, details);
    case "NO_TRUST_LINE":
      return new NoTrustLineError(
        "Destination" in tx && tx.Destination ? String(tx.Destination) : account,
        cause,
        details,
      );
    case "NOT_ALLOWED":
      return new NotAllowedError(account, tx.TransactionType, cause, details);
    case "NOT_FOUND":
      return new NotFoundError(targetOf(tx), cause, details);
    case "OFFER_EXPIRED":
      return new OfferExpiredError(offerId || "(unknown)", cause, details);
    case "TX_EXPIRED":
      return new TxExpiredError(tx.TransactionType, cause, details);
    default:
      if (code.startsWith("tem")) {
        return new InvalidTransactionError(
          `${tx.TransactionType} is malformed: ${code}`,
          cause,
          details,
        );
      }
      return new LedgerError(
        `${tx.TransactionType} failed with ${code}`,
        "TX_FAILED",
        cause,
        details,
      );
  }
}

export interface SubmitOptions {
  /** Board meaning of the transaction. Copied into the `tx.*` events. */
  kind?: TxKind;
  /** Appends the task memo (see `taskMemo`) to the transaction's `Memos`. */
  taskId?: string;
  /** Used for explorer links in events. Default: `loadConfig()`. */
  config?: LedgerConfig;
  /** How often to ask for the outcome. Default 1000 ms (testnet closes a ledger every 3 to 5 s). */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
/** Give up on learning the outcome after this long without a connection. */
const OUTCOME_DEADLINE_MS = 180_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const accountQueues = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` after every earlier `fn` for the same account has settled. This keeps autofilled
 * Sequence numbers unique when the server sends many transactions from the vault at once.
 */
async function withAccountLock<R>(account: string, fn: () => Promise<R>): Promise<R> {
  const previous = accountQueues.get(account) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  accountQueues.set(account, settled);
  void settled.then(() => {
    if (accountQueues.get(account) === settled) accountQueues.delete(account);
  });
  return run;
}

function isConnectionError(error: unknown): boolean {
  return error instanceof ConnectionError;
}

function rippledErrorName(error: unknown): string | undefined {
  if (!(error instanceof RippledError)) return undefined;
  const data = error.data as { error?: unknown } | undefined;
  return typeof data?.error === "string" ? data.error : undefined;
}

/** Codes from `submit` that mean the transaction did not apply and will not apply later. */
function isFinalPreliminary(code: string): boolean {
  return code.startsWith("tem") || code.startsWith("tef") || code.startsWith("tel");
}

/**
 * Autofills, signs, submits, and waits for a validated ledger. Throws a typed LedgerError on failure.
 *
 * Emits `tx.pending` once the hash is known, then `tx.validated` or `tx.failed` on `ledgerEvents`.
 * Survives a dropped connection: it waits for the reconnect and keeps polling by hash, because a
 * signed transaction can still validate while the socket is down.
 */
export async function submitTx<T extends SubmittableTransaction>(
  client: Client,
  wallet: Wallet,
  tx: T,
  options: SubmitOptions = {},
): Promise<TxResponse<T>> {
  const config = options.config ?? loadConfig();
  const account = wallet.classicAddress;
  const toSubmit: T = options.taskId
    ? { ...tx, Memos: [...(tx.Memos ?? []), ...taskMemo(options.taskId)] }
    : tx;
  const base = {
    kind: options.kind ?? null,
    txType: tx.TransactionType,
    account,
    taskId: readTaskMemo(toSubmit),
  };

  let hash: string | undefined;
  const fail = (error: LedgerError, onLedger: boolean): LedgerError => {
    if (hash) {
      ledgerEvents.emit("tx.failed", {
        ...base,
        hash,
        code: error.resultCode ?? error.code,
        errorCode: error.code as LedgerErrorCode,
        message: error.message,
        explorerUrl: onLedger ? explorerTxUrl(config, hash) : null,
      });
    }
    return error;
  };

  // 1. Sign and submit under the account lock, so the next autofill sees the new Sequence.
  const { lastLedger } = await withAccountLock(account, async () => {
    let prepared: T;
    let signed: { tx_blob: string; hash: string };
    try {
      await ensureConnected(client);
      prepared = await client.autofill(toSubmit);
      signed = wallet.sign(prepared);
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      if (error instanceof ValidationError) {
        throw new InvalidTransactionError(error.message, error);
      }
      throw new NetworkError(`Cannot prepare ${tx.TransactionType}: ${String(error)}`, error);
    }
    const signedHash = signed.hash;
    hash = signedHash;
    ledgerEvents.emit("tx.pending", {
      ...base,
      hash: signedHash,
      explorerUrl: explorerTxUrl(config, signedHash),
    });
    const rejected = (error: unknown) => {
      const reason = rippledErrorName(error) ?? String(error);
      return fail(
        new LedgerError(
          `The server rejected ${tx.TransactionType}: ${reason}`,
          "TX_FAILED",
          error,
          {
            hash: signedHash,
            resultCode: reason,
          },
        ),
        false,
      );
    };

    let preliminary: string;
    try {
      preliminary = await submitBlob(client, signed.tx_blob);
    } catch (error) {
      if (!isConnectionError(error)) throw rejected(error);
      // The server may or may not have the transaction. Reconnect and send the same blob again:
      // a transaction with this hash can apply at most once.
      try {
        await ensureConnected(client);
        preliminary = await submitBlob(client, signed.tx_blob);
        if (preliminary === "tefALREADY" || preliminary === "tefPAST_SEQ") preliminary = "unknown";
      } catch (retryError) {
        if (!isConnectionError(retryError) && !(retryError instanceof NetworkError)) {
          throw rejected(retryError);
        }
        preliminary = "unknown";
      }
    }
    if (isFinalPreliminary(preliminary)) {
      throw fail(errorForResult(preliminary, tx, account, undefined, hash), false);
    }
    return { lastLedger: prepared.LastLedgerSequence ?? Number.POSITIVE_INFINITY };
  });
  const txHash = hash!;

  // 2. Poll by hash until a validated ledger has it, or LastLedgerSequence has passed.
  const response = await waitForOutcome<T>(
    client,
    tx.TransactionType,
    txHash,
    lastLedger,
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  ).catch((error: unknown) => {
    if (error instanceof LedgerError) throw fail(error, false);
    throw fail(
      new NetworkError(`Outcome of ${txHash} is unknown: ${String(error)}`, error, {
        hash: txHash,
      }),
      false,
    );
  });

  const code = resultCode(response);
  if (code === "tesSUCCESS") {
    ledgerEvents.emit("tx.validated", {
      ...base,
      hash: txHash,
      explorerUrl: explorerTxUrl(config, txHash),
      result: code,
      ledgerIndex: response.result.ledger_index ?? 0,
    });
    return response;
  }
  throw fail(errorForResult(code, tx, account, response, txHash), true);
}

async function submitBlob(client: Client, txBlob: string): Promise<string> {
  const response = await client.request({ command: "submit", tx_blob: txBlob });
  return response.result.engine_result;
}

async function waitForOutcome<T extends SubmittableTransaction>(
  client: Client,
  txType: string,
  hash: string,
  lastLedger: number,
  pollIntervalMs: number,
): Promise<TxResponse<T>> {
  let disconnectedSince: number | undefined;
  for (;;) {
    await sleep(pollIntervalMs);
    try {
      const latest = await client.getLedgerIndex();
      try {
        const response = await client.request({ command: "tx", transaction: hash });
        if (response.result.validated) return response as unknown as TxResponse<T>;
      } catch (error) {
        if (rippledErrorName(error) !== "txnNotFound") throw error;
      }
      if (latest > lastLedger) {
        throw new TxExpiredError(txType, undefined, { hash, resultCode: "tefMAX_LEDGER" });
      }
      disconnectedSince = undefined;
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      disconnectedSince ??= Date.now();
      if (Date.now() - disconnectedSince > OUTCOME_DEADLINE_MS) {
        throw new NetworkError(`Lost the XRPL connection while waiting for ${hash}`, error, {
          hash,
        });
      }
      await ensureConnected(client).catch(() => undefined);
    }
  }
}
