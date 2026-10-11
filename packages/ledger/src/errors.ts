import type { LedgerErrorCode } from "@agent-pledge/shared";

/** Extra facts about a failed transaction. Both fields are absent for errors that are not about a transaction. */
export interface LedgerErrorDetails {
  /** The raw XRPL result code, for example `tecOBJECT_NOT_FOUND`. */
  resultCode?: string;
  /** The transaction hash, when the transaction was signed. Use it for an explorer link. */
  hash?: string;
}

/**
 * Base class for every error that the ledger package throws on purpose.
 * `code` is a stable value that the server can switch on: one of `LedgerErrorCode` from
 * `@agent-pledge/shared`.
 */
export class LedgerError extends Error {
  public readonly resultCode: string | undefined;
  public readonly hash: string | undefined;

  constructor(
    message: string,
    public readonly code: LedgerErrorCode,
    public readonly cause?: unknown,
    details: LedgerErrorDetails = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.resultCode = details.resultCode;
    this.hash = details.hash;
  }
}

/** The offer no longer exists. Somebody else claimed first. Maps to HTTP 409 in the server. */
export class AlreadyClaimedError extends LedgerError {
  constructor(offerId: string, cause?: unknown, details?: LedgerErrorDetails) {
    super(`Offer ${offerId} was already accepted`, "ALREADY_CLAIMED", cause, details);
  }
}

/** The account does not have enough of the token or XRP, or not enough XRP for the reserve. HTTP 402 or 409. */
export class InsufficientFundsError extends LedgerError {
  constructor(account: string, cause?: unknown, details?: LedgerErrorDetails, message?: string) {
    super(
      message ?? `Account ${account} has insufficient funds`,
      "INSUFFICIENT_FUNDS",
      cause,
      details,
    );
  }
}

/** The XRPL server cannot be reached, or the connection dropped and did not come back in time. HTTP 503. */
export class NetworkError extends LedgerError {
  constructor(message: string, cause?: unknown, details?: LedgerErrorDetails) {
    super(message, "NETWORK", cause, details);
  }
}

/** A required trust line is missing or not authorized. Usually a setup problem. HTTP 500. */
export class NoTrustLineError extends LedgerError {
  constructor(account: string, cause?: unknown, details?: LedgerErrorDetails) {
    super(`A token trust line for ${account} is missing`, "NO_TRUST_LINE", cause, details);
  }
}

/**
 * The account may not do this, for example a wallet accepting an offer whose Destination is a
 * different account, or a non-owner burning an NFT. HTTP 403.
 */
export class NotAllowedError extends LedgerError {
  constructor(account: string, txType: string, cause?: unknown, details?: LedgerErrorDetails) {
    super(
      `Account ${account} is not allowed to send this ${txType}`,
      "NOT_ALLOWED",
      cause,
      details,
    );
  }
}

/** The ledger object (NFT, offer, destination account) does not exist. HTTP 404. */
export class NotFoundError extends LedgerError {
  constructor(what: string, cause?: unknown, details?: LedgerErrorDetails) {
    super(`${what} does not exist on the ledger`, "NOT_FOUND", cause, details);
  }
}

/** The NFT offer has expired. HTTP 410. */
export class OfferExpiredError extends LedgerError {
  constructor(offerId: string, cause?: unknown, details?: LedgerErrorDetails) {
    super(`Offer ${offerId} has expired`, "OFFER_EXPIRED", cause, details);
  }
}

/**
 * The transaction was not validated before its LastLedgerSequence. It will never apply, so it is
 * safe to build and submit it again. HTTP 503.
 */
export class TxExpiredError extends LedgerError {
  /**
   * @param preliminary The preliminary result from `submit`, if it explains the expiry. For example
   *   `terINSUF_FEE_B`: the account could not pay the fee, so the server held it until it expired.
   */
  constructor(txType: string, cause?: unknown, details?: LedgerErrorDetails, preliminary?: string) {
    super(
      `${txType} expired before a validated ledger included it` +
        (preliminary ? ` (preliminary result ${preliminary})` : ""),
      "TX_EXPIRED",
      cause,
      details,
    );
  }
}

/** The transaction is malformed (a `tem` code) or rejected by xrpl.js validation. A bug in our code. HTTP 500. */
export class InvalidTransactionError extends LedgerError {
  constructor(message: string, cause?: unknown, details?: LedgerErrorDetails) {
    super(message, "INVALID_TX", cause, details);
  }
}

/** What the vault received on the ledger for one task. Values are token amounts. */
export interface FundingReceived {
  /** The task price, from the requester's `task.fund` payments. */
  price: string;
  /** The agent's pledge, from validated accepts of the vault's task offer. */
  pledge: string;
  /** Sub-task money per sub-task ID, from the agent's `subtask.fund` payments. */
  subtasks: Record<string, string>;
}

/**
 * The amounts the caller expects for a task differ from what the vault received on the ledger.
 * failTask sends nothing in this case. `received` has the ledger's view, so the server can decide.
 */
export class FundingMismatchError extends LedgerError {
  constructor(
    public readonly taskId: string,
    public readonly problems: readonly string[],
    public readonly received: FundingReceived,
  ) {
    super(
      `Task ${taskId} funding on the ledger differs from the input: ${problems.join("; ")}`,
      "FUNDING_MISMATCH",
    );
  }
}

/** The offer on the ledger is not the payout offer the vault expects. Nothing was submitted. */
export class OfferMismatchError extends LedgerError {
  constructor(
    offerId: string,
    public readonly problems: readonly string[],
  ) {
    super(
      `Offer ${offerId} is not the expected payout offer: ${problems.join("; ")}`,
      "OFFER_MISMATCH",
    );
  }
}

/** An environment variable is missing or invalid. */
export class ConfigError extends LedgerError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONFIG", cause);
  }
}
