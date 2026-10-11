import type { TxKind, TxStatus } from "@agent-pledge/shared";

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
