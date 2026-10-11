import type { Client, SubmittableTransaction, TxResponse, Wallet } from "xrpl";
import { AlreadyClaimedError, InsufficientFundsError, LedgerError } from "./errors.js";

/** Reads the engine result code from a validated transaction response. */
export function resultCode(response: TxResponse): string {
  const meta = response.result.meta;
  if (meta && typeof meta === "object" && "TransactionResult" in meta) {
    return String(meta.TransactionResult);
  }
  return "unknown";
}

/**
 * Autofills, signs, submits, and waits for validation. Throws a typed LedgerError on failure.
 * The ops owner (issues #4 to #9) builds on this. The core owner (issue #10) may add event emission.
 */
export async function submitTx<T extends SubmittableTransaction>(
  client: Client,
  wallet: Wallet,
  tx: T,
): Promise<TxResponse<T>> {
  const response = await client.submitAndWait(tx, { autofill: true, wallet });
  const code = resultCode(response);
  if (code === "tesSUCCESS") return response;
  const offerId =
    "NFTokenSellOffer" in tx
      ? String(tx.NFTokenSellOffer)
      : "NFTokenBuyOffer" in tx
        ? String(tx.NFTokenBuyOffer)
        : "";
  if (code === "tecOBJECT_NOT_FOUND" && offerId) throw new AlreadyClaimedError(offerId, response);
  if (
    code === "tecUNFUNDED_PAYMENT" ||
    code === "tecINSUFFICIENT_FUNDS" ||
    code === "tecUNFUNDED_OFFER"
  ) {
    throw new InsufficientFundsError(wallet.classicAddress, response);
  }
  throw new LedgerError(`${tx.TransactionType} failed with ${code}`, code, response);
}
