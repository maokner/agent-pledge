/**
 * The human side speaks plain words (PRD R7): a Helper never needs to know
 * how the money moves, so these words never reach their screen.
 */
export const CRYPTO_WORDS = [
  "wallet",
  "nft",
  "nftoken",
  "xrpl",
  "xrp",
  "rlusd",
  "ledger",
  "token",
  "testnet",
  "crypto",
  "blockchain",
] as const;

const PATTERN = new RegExp(`\\b(?:${CRYPTO_WORDS.join("|")})s?\\b`, "i");

/** Whether `text` has one of the crypto words, in any case, alone or plural. */
export function hasCryptoWord(text: string): boolean {
  return PATTERN.test(text);
}

/** Shown in place of a server message that would put crypto words on the screen. */
export const PLAIN_FALLBACK_MESSAGE = "Something went wrong on our side. Try again in a moment.";

/** A server message, unless it talks about the plumbing; then a plain one. */
export function plainMessage(message: string): string {
  return hasCryptoWord(message) ? PLAIN_FALLBACK_MESSAGE : message;
}
