import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/** A random 4-digit PIN, e.g. "4821". */
export function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

/** scrypt$<salt hex>$<hash hex>. Store only this, never the PIN. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}
