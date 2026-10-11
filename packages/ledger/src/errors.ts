export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The offer no longer exists. Somebody else claimed first. Maps to HTTP 409 in the server. */
export class AlreadyClaimedError extends LedgerError {
  constructor(offerId: string, cause?: unknown) {
    super(`Offer ${offerId} was already accepted`, "ALREADY_CLAIMED", cause);
  }
}

export class InsufficientFundsError extends LedgerError {
  constructor(account: string, cause?: unknown) {
    super(`Account ${account} has insufficient funds`, "INSUFFICIENT_FUNDS", cause);
  }
}

export class NetworkError extends LedgerError {
  constructor(message: string, cause?: unknown) {
    super(message, "NETWORK", cause);
  }
}
