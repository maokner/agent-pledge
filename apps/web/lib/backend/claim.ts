/**
 * The real server's claim page shapes mapped into the web app's ClaimView,
 * plus where the claim page keeps the server's helper token.
 */
import type { ClaimState, ClaimTx, ClaimView, NftHolder } from "@/lib/contract";
import { photoFrom, txKindFromBackend, txStatusFromBackend } from "./board";
import type { BackendClaimView, BackendPayout, BackendTxView } from "./types";

export interface ClaimViewOptions {
  /** Epoch ms when the view arrived. The server sends no clock, so this stands in for server_time. */
  now: number;
  /** The sub-task's time limit, which the claim view does not carry. Null: use the minutes left. */
  timeLimitMinutes?: number | null;
}

export function claimViewFromBackend(
  view: BackendClaimView,
  { now, timeLimitMinutes = null }: ClaimViewOptions,
): ClaimView {
  const minutesLeft = Math.max(1, Math.ceil((Date.parse(view.deadline) - now) / 60_000) || 1);
  // A server from before proof modes (commit a4092c5) sends none of these: PIN mode, nothing on the ledger yet.
  const extra: Partial<Pick<BackendClaimView, LedgerFields>> = view;
  const proof = extra.proof ?? "pin";
  return {
    code: view.code,
    state: claimStateOf({ ...view, proof }),
    subtask: {
      description: view.description,
      place: view.place,
      time_limit_minutes: timeLimitMinutes ?? minutesLeft,
      deadline_at: view.deadline,
      price: view.price,
    },
    // The server sends the photo to anyone who asks (open question 3); only the phone that claimed sees it here.
    photo: view.claimed_by_you ? photoFrom(view.photo, view.helper_note) : null,
    pin_attempts_left: view.pin.attempts_left,
    payout: view.payout && { ...view.payout, status: "validated" },
    // No server_time from the server yet: the phone's clock, so the countdown offset is zero.
    server_time: new Date(now).toISOString(),
    proof,
    proof_sha256: extra.proof_sha256 ?? null,
    nft: extra.nft
      ? {
          id: extra.nft.id,
          explorer_url: extra.nft.explorer_url,
          holder: HOLDERS.has(extra.nft.holder) ? extra.nft.holder : "vault",
          parent_nft_id: extra.nft.parent_nft_id,
          parent_explorer_url: extra.nft.parent_explorer_url,
        }
      : null,
    escrow: extra.escrow ?? null,
    transactions: claimTxsFromBackend(extra.transactions ?? []),
  };
}

type LedgerFields = "proof" | "proof_sha256" | "nft" | "escrow" | "transactions";

const HOLDERS: ReadonlySet<string> = new Set<NftHolder>(["vault", "you", "helper", "burned"]);

/**
 * The page's state, from the server's status, claimed_by_you, PIN state, payout
 * and proof mode.
 */
export function claimStateOf(
  view: Pick<BackendClaimView, "status" | "claimed_by_you" | "pin" | "payout" | "photo"> & {
    proof?: BackendClaimView["proof"];
  },
): ClaimState {
  if (view.status === "failed") return "expired";
  if (view.status === "open") return "open";
  if (!view.claimed_by_you) return "already_claimed";
  if (view.payout) return "paid";
  // The server answers the right PIN only after the payout lands, so another tab can see this in between.
  if (view.pin.verified || view.status === "done") return "paying";
  if (view.pin.locked) return "locked";
  // Photo mode: the photo is the proof. With it in and no payout yet, the page pays (POST /claim/:code/pay).
  if (view.proof === "photo" && view.photo) return "paying";
  return "claimed_by_you";
}

/**
 * The claim from a photo or pay response, with the response's own `payout` on
 * it when the claim inside does not carry it yet.
 */
export function withPayout(
  claim: BackendClaimView,
  payout: BackendPayout | null | undefined,
): BackendClaimView {
  return payout && !claim.payout ? { ...claim, payout } : claim;
}

/** The sub-task's transactions, oldest first, with the web app's kind names. Unknown kinds are left out. */
export function claimTxsFromBackend(txs: BackendTxView[]): ClaimTx[] {
  return txs.flatMap((tx) => {
    const kind = txKindFromBackend(tx.kind);
    if (!kind) return [];
    return {
      hash: tx.hash,
      kind,
      status: txStatusFromBackend(tx.status),
      // The claim page shows amounts as dollars, so it leaves out XRP (wallet setup).
      amount: tx.currency === "XRP" ? null : tx.amount,
      explorer_url: tx.explorer_url,
      nft_id: tx.nft_id,
      submitted_at: tx.created_at,
      validated_at: tx.validated_at,
      error: tx.error,
    };
  });
}

/**
 * The helper token from `POST /claim/:code/claim`, one per claim code, in
 * localStorage. The claim page and the server are on different origins, so the
 * client sends it back as `x-helper-token` instead of relying on the cookie.
 * Never throws: without storage (private mode, blocked site data) it just forgets.
 */
export interface HelperTokenStore {
  get(code: string): string | null;
  set(code: string, token: string): void;
}

export function createHelperTokenStore(
  storage: () => Storage | null = browserStorage,
): HelperTokenStore {
  const key = (code: string) => `agent-pledge:helper-token:${code.trim().toUpperCase()}`;
  return {
    get(code) {
      try {
        return storage()?.getItem(key(code)) ?? null;
      } catch {
        return null;
      }
    },
    set(code, token) {
      try {
        storage()?.setItem(key(code), token);
      } catch {
        // Storage is full or blocked: this phone keeps the claim only while the page is open (and via the cookie).
      }
    },
  };
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
