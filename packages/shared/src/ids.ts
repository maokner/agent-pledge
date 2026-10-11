/**
 * ID and code generation. Works in Node and in the browser (uses crypto.getRandomValues).
 */

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Unambiguous uppercase alphanumerics: no 0/O, 1/I/L. Used for claim codes and board codes. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;
export const CODE_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export type IdPrefix = "task" | "sub" | "wal" | "med";

/** newId("task") -> "task_k3j9x0c2m1q8z7w4". */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomString(ID_ALPHABET, 16)}`;
}

/** A 4-character code like "7Q2K". Callers must retry on a unique-constraint collision. */
export function newCode(): string {
  return randomString(CODE_ALPHABET, CODE_LENGTH);
}

/** Normalizes user input ("7q2k " -> "7Q2K"). Returns null when it is not a valid code. */
export function normalizeCode(input: string): string | null {
  const c = input.trim().toUpperCase();
  return CODE_REGEX.test(c) ? c : null;
}
