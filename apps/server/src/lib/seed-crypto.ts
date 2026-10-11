import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for wallet seeds held by the server (requester and helper wallets).
 * The key is SHA-256(SEED_ENCRYPTION_KEY). Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 */
function key(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSeed(seed: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const ct = Buffer.concat([cipher.update(seed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSeed(encrypted: string, secret: string): string {
  const [v, iv, tag, ct] = encrypted.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad encrypted seed format");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
