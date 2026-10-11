import type { IsoDateTime, NftId, RlusdAmount, TxHash, XrplAddress } from "@agent-pledge/shared";
import { EXPLORER_URL, trimSlash } from "./config";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Shows an RLUSD amount as US dollars, the way the PRD does: "4" -> "$4.00".
 * A malformed amount shows "—" so one bad value cannot break the board.
 */
export function formatRlusd(amount: RlusdAmount): string {
  if (!DECIMAL.test(amount.trim())) return "—";
  return usd.format(Number(amount));
}

/** A gain or loss: "1" -> "+$1.00", "-1" -> "−$1.00", "0" -> "$0.00". */
export function formatSignedRlusd(amount: RlusdAmount): string {
  const n = Number(amount);
  if (!DECIMAL.test(amount.trim()) || n === 0) return formatRlusd(amount.replace(/^-/, ""));
  return `${n > 0 ? "+" : "−"}${usd.format(Math.abs(n))}`;
}

/** A time limit: 3 -> "3 min", 90 -> "1 h 30 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Explorer page for a transaction. */
export function explorerTxUrl(hash: TxHash, base: string = EXPLORER_URL): string {
  return `${trimSlash(base)}/transactions/${hash}`;
}

/** Explorer page for an account. */
export function explorerAccountUrl(address: XrplAddress, base: string = EXPLORER_URL): string {
  return `${trimSlash(base)}/accounts/${address}`;
}

/** Explorer page for an NFT. */
export function explorerNftUrl(nftId: NftId, base: string = EXPLORER_URL): string {
  return `${trimSlash(base)}/nft/${nftId}`;
}

/** "C53ECF838647...B207AB4A7E" -> "C53ECF…4A7E", for hashes, NFT IDs and addresses. */
export function shortHash(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Countdown to a deadline: "2:31", "1:05:09", or "0:00" once it has passed. */
export function formatTimeLeft(deadline: IsoDateTime, now: number): string {
  const total = Math.max(0, Math.floor((Date.parse(deadline) - now) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
