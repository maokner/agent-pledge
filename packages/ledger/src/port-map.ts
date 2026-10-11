/**
 * Pure mappings between this package and the server contract in @agent-pledge/shared
 * (packages/shared/src/ledger.ts): money strings, transaction kinds, and typed errors.
 * No network. Unit tested in src/__tests__/port-map.test.ts.
 */
import {
  AlreadyClaimedError as ContractAlreadyClaimedError,
  LedgerError as ContractLedgerError,
  LedgerNetworkError,
  LedgerTxFailedError,
  type Money,
  type TxKind as ContractTxKind,
} from "@agent-pledge/shared";
import { LedgerError } from "./errors.js";
import { formatIouValue, normalizeLedgerValue } from "./ops/amount.js";
import type { TxKind } from "./shared-types.js";

// ---------- money ----------

/** Contract Money ("5.00") to the decimal string the ops use ("5"). */
export function fromMoney(money: Money | string): string {
  return formatIouValue(money.trim());
}

/**
 * A decimal string from the ops or the ledger ("5", "0.5", "1e-1") to contract Money with exactly
 * two decimals ("5.00", "0.50"). Throws a RangeError when the value has more than two decimals,
 * because Money cannot hold it.
 */
export function toMoney(value: string): Money {
  const plain = normalizeLedgerValue(value);
  if (plain === undefined) throw new RangeError(`"${value}" is not a decimal amount`);
  const [whole = "0", fraction = ""] = plain.split(".");
  if (fraction.length > 2) {
    throw new RangeError(`${plain} has more than two decimals and is not a Money value`);
  }
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

/** Like toMoney, but undefined for a value Money cannot hold. For display fields in events. */
export function toMoneyOrUndefined(value: string | undefined): Money | undefined {
  if (value === undefined) return undefined;
  try {
    return toMoney(value);
  } catch {
    return undefined;
  }
}

// ---------- kinds ----------

/** What the dotted kind alone does not say. */
export interface KindHints {
  /** The transaction belongs to a sub-task (a sub-task memo or a ctx.subtaskId). */
  subtask?: boolean | undefined;
}

/**
 * Maps this package's dotted kind (and the XRPL transaction type, for untagged transactions) to the
 * contract's snake_case kind. Returns undefined for a transaction the contract has no kind for.
 *
 * | ops kind         | contract kind                                  |
 * | ---------------- | ---------------------------------------------- |
 * | task.fund        | task_funding                                   |
 * | task.mint        | task_nft_mint                                  |
 * | task.offer       | task_offer                                     |
 * | task.claim       | task_claim                                     |
 * | subtask.fund     | subtask_funding                                |
 * | subtask.mint     | subtask_nft_mint                               |
 * | subtask.offer    | subtask_offer                                  |
 * | subtask.claim    | subtask_claim                                  |
 * | payout.offer     | helper_redeem_offer (sub-task) / agent_redeem_offer |
 * | payout.accept    | helper_payout (sub-task) / agent_payout        |
 * | nft.burn         | subtask_nft_burn (sub-task) / task_nft_burn    |
 * | refund           | refund_agent (sub-task) / refund_requester     |
 * | token.transfer   | requester_funding                              |
 * | none + TrustSet  | wallet_setup                                   |
 */
export function toContractKind(
  kind: TxKind | null,
  txType: string,
  hints: KindHints = {},
): ContractTxKind | undefined {
  const sub = hints.subtask === true;
  switch (kind) {
    case "task.fund":
      return "task_funding";
    case "task.mint":
      return "task_nft_mint";
    case "task.offer":
      return "task_offer";
    case "task.claim":
      return "task_claim";
    case "subtask.fund":
      return "subtask_funding";
    case "subtask.mint":
      return "subtask_nft_mint";
    case "subtask.offer":
      return "subtask_offer";
    case "subtask.claim":
      return "subtask_claim";
    case "payout.offer":
      return sub ? "helper_redeem_offer" : "agent_redeem_offer";
    case "payout.accept":
      return sub ? "helper_payout" : "agent_payout";
    case "nft.burn":
      return sub ? "subtask_nft_burn" : "task_nft_burn";
    case "refund":
      return sub ? "refund_agent" : "refund_requester";
    case "token.transfer":
      return "requester_funding";
    case null:
      return txType === "TrustSet" ? "wallet_setup" : undefined;
  }
}

// ---------- errors ----------

/** xrpl.js errors that mean the connection, not the transaction, failed. */
const XRPL_CONNECTION_ERRORS = new Set([
  "ConnectionError",
  "NotConnectedError",
  "DisconnectedError",
  "TimeoutError",
  "WebSocketError",
]);

/**
 * Maps any error from the ops to the contract's typed errors:
 * ALREADY_CLAIMED -> AlreadyClaimedError, NETWORK and TX_EXPIRED (both safe to retry) and xrpl.js
 * connection errors -> LedgerNetworkError, everything else -> LedgerTxFailedError with the XRPL
 * result code (or our error code) and the hash. Contract errors pass through unchanged.
 */
export function toContractError(error: unknown): Error {
  if (error instanceof ContractLedgerError) return error;
  if (error instanceof LedgerError) {
    if (error.code === "ALREADY_CLAIMED") {
      return withCause(new ContractAlreadyClaimedError(error.message, error.hash), error);
    }
    if (error.code === "NETWORK" || error.code === "TX_EXPIRED") {
      return withCause(new LedgerNetworkError(error.message), error);
    }
    return withCause(
      new LedgerTxFailedError(error.message, error.resultCode ?? error.code, error.hash),
      error,
    );
  }
  const name = (error as { name?: unknown } | undefined)?.name;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof name === "string" && XRPL_CONNECTION_ERRORS.has(name)) {
    return withCause(new LedgerNetworkError(message), error);
  }
  return withCause(new LedgerTxFailedError(message), error);
}

function withCause<E extends Error>(target: E, cause: unknown): E {
  Object.defineProperty(target, "cause", { value: cause, enumerable: false, configurable: true });
  return target;
}

/** Board memo text, the same shape the server's FakeLedger uses. */
export function boardMemo(ids: { taskId?: string | undefined; subtaskId?: string | undefined }) {
  if (ids.subtaskId) return `agent-pledge:subtask:${ids.subtaskId}`;
  if (ids.taskId) return `agent-pledge:task:${ids.taskId}`;
  return undefined;
}
