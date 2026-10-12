/**
 * The ledger side of a fixture claim: the sub-task NFT and its transactions,
 * each submitted at a time and validated (or failed) a ledger close or so
 * later. Transactions can be scheduled ahead (the payout's three steps), so
 * reading the ledger at a later time shows the list growing, the way the real
 * server's claim view does.
 */
import type {
  ClaimTx,
  ClaimView,
  NftHolder,
  NftId,
  RlusdAmount,
  TxHash,
  TxKind,
} from "@/lib/contract";
import { explorerAccountUrl, explorerNftUrl, explorerTxUrl } from "../format";
import { fakeHex } from "./factories";

/** The demo vault on XRPL Testnet. */
export const FIXTURE_VAULT_ADDRESS = "r37hDaqXGUL574V8y91XSoktYDpc9HpPjN";

/** About one ledger close. */
export const LEDGER_CLOSE_MS = 3500;

/** The payout's steps after the proof is in: payout offer, payout (the helper is paid), burn. */
export const PAYOUT_OFFER_MS = 1500;
export const PAYOUT_MS = 4000;
const BURN_AFTER_MS = 600;
const BURN_SETTLE_MS = 2500;

export interface FixtureTx {
  hash: TxHash;
  kind: TxKind;
  amount: RlusdAmount | null;
  /** Epoch ms when it was submitted; it is not listed before then. */
  at: number;
  /** How long it stays pending. */
  settleMs: number;
  /** Ends failed instead of validated. */
  fails?: string;
}

export interface FixtureLedger {
  nftId: NftId;
  parentNftId: NftId;
  price: RlusdAmount;
  /** Another phone claimed the NFT. */
  takenByOther: boolean;
  txs: FixtureTx[];
  /** Seeds the next transaction hash. */
  nextSeed: number;
}

/** NFTokenID laid out like the vault's: flags 0008 (transferable), fee 0, the vault's account ID, taxon, sequence. */
export function fixtureNftId(sequence: number): NftId {
  const account = fakeHex(424_242).slice(0, 40);
  const taxon = fakeHex(sequence * 31 + 7).slice(0, 8);
  return `00080000${account}${taxon}${sequence.toString(16).toUpperCase().padStart(8, "0")}`;
}

/** A sha256 hex digest look-alike (lowercase, 64 characters). */
export function fixtureSha256(seed: number): string {
  return fakeHex(seed * 97 + 13).toLowerCase();
}

export function newLedger(
  code: string,
  price: RlusdAmount,
  { takenByOther = false }: { takenByOther?: boolean } = {},
): FixtureLedger {
  const seed = [...code].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) % 100_000;
  return {
    nftId: fixtureNftId(seed * 2 + 1),
    parentNftId: fixtureNftId(seed * 2),
    price,
    takenByOther,
    txs: [],
    nextSeed: seed * 100,
  };
}

export function addTx(
  ledger: FixtureLedger,
  kind: TxKind,
  at: number,
  {
    settleMs = LEDGER_CLOSE_MS,
    amount = null,
    fails,
    hash,
  }: { settleMs?: number; amount?: RlusdAmount | null; fails?: string; hash?: TxHash } = {},
): FixtureTx {
  const tx: FixtureTx = {
    hash: hash ?? fakeHex(++ledger.nextSeed),
    kind,
    amount,
    at,
    settleMs,
    fails,
  };
  ledger.txs.push(tx);
  return tx;
}

/** The agent funds the vault, the vault mints the sub-task NFT and offers it to anyone. */
export function addOpening(ledger: FixtureLedger, at: number): void {
  addTx(ledger, "subtask_escrow", at, { amount: ledger.price });
  addTx(ledger, "subtask_nft_mint", at + 4000);
  addTx(ledger, "subtask_nft_offer", at + 8000);
}

/** A helper accepts the offer. */
export function addClaim(ledger: FixtureLedger, at: number, settleMs = LEDGER_CLOSE_MS): void {
  addTx(ledger, "subtask_claim", at, { settleMs });
}

/**
 * The payout, from `start`: the helper's payout offer, the vault paying, then
 * the burn. Returns the payout transaction (the one that pays the helper).
 */
export function addPayout(ledger: FixtureLedger, start: number, payoutHash?: TxHash): FixtureTx {
  addTx(ledger, "helper_payout_offer", start, { settleMs: PAYOUT_OFFER_MS, amount: ledger.price });
  const payout = addTx(ledger, "helper_payout", start + PAYOUT_OFFER_MS, {
    settleMs: PAYOUT_MS - PAYOUT_OFFER_MS,
    amount: ledger.price,
    hash: payoutHash,
  });
  addTx(ledger, "nft_burn", start + PAYOUT_MS + BURN_AFTER_MS, { settleMs: BURN_SETTLE_MS });
  return payout;
}

/** Time ran out: the vault returns the money to the agent and burns the NFT. */
export function addRefund(ledger: FixtureLedger, at: number): void {
  addTx(ledger, "agent_refund", at, { amount: ledger.price });
  addTx(ledger, "nft_burn", at + 4000);
}

const settled = (tx: FixtureTx, now: number) => now >= tx.at + tx.settleMs;

function validated(ledger: FixtureLedger, kind: TxKind, now: number): FixtureTx | undefined {
  return ledger.txs.find((tx) => tx.kind === kind && !tx.fails && settled(tx, now));
}

/** The payout transaction once it is validated: the helper is paid. */
export function paidTx(ledger: FixtureLedger, now: number): FixtureTx | undefined {
  return validated(ledger, "helper_payout", now);
}

/** When the scheduled payout lands (epoch ms), or null if none is scheduled. */
export function payoutLandsAt(ledger: FixtureLedger): number | null {
  const tx = ledger.txs.find((t) => t.kind === "helper_payout" && !t.fails);
  return tx ? tx.at + tx.settleMs : null;
}

export function holderAt(ledger: FixtureLedger, now: number): NftHolder {
  if (validated(ledger, "nft_burn", now)) return "burned";
  if (validated(ledger, "helper_payout", now) || validated(ledger, "agent_refund", now))
    return "vault";
  if (validated(ledger, "subtask_claim", now)) return ledger.takenByOther ? "helper" : "you";
  return "vault";
}

/** The claim view's ledger fields at `now`. */
export function ledgerFields(
  ledger: FixtureLedger,
  now: number,
): Pick<ClaimView, "nft" | "escrow" | "transactions"> {
  const minted = validated(ledger, "subtask_nft_mint", now);
  return {
    nft: minted
      ? {
          id: ledger.nftId,
          explorer_url: explorerNftUrl(ledger.nftId),
          holder: holderAt(ledger, now),
          parent_nft_id: ledger.parentNftId,
          parent_explorer_url: explorerNftUrl(ledger.parentNftId),
        }
      : null,
    escrow: {
      amount: ledger.price,
      vault_address: FIXTURE_VAULT_ADDRESS,
      vault_explorer_url: explorerAccountUrl(FIXTURE_VAULT_ADDRESS),
    },
    transactions: ledger.txs
      .filter((tx) => tx.at <= now)
      .sort((a, b) => a.at - b.at)
      .map((tx): ClaimTx => {
        const done = settled(tx, now);
        return {
          hash: tx.hash,
          kind: tx.kind,
          status: !done ? "pending" : tx.fails ? "failed" : "validated",
          amount: tx.amount,
          explorer_url: explorerTxUrl(tx.hash),
          nft_id: tx.kind === "subtask_escrow" ? null : ledger.nftId,
          submitted_at: new Date(tx.at).toISOString(),
          validated_at: done ? new Date(tx.at + tx.settleMs).toISOString() : null,
          error: done && tx.fails ? tx.fails : null,
        };
      }),
  };
}
