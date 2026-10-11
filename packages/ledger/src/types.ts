import type { TxKind, TxStatus } from "./shared-types.js";

export interface SubmittedTx {
  hash: string;
  kind: TxKind;
  status: TxStatus;
  explorerUrl: string;
}

export interface WalletInfo {
  address: string;
  /** Secret seed. Store encrypted. Never log. */
  seed: string;
}
