import { convertHexToString, convertStringToHex } from "xrpl";

/** NFTokenMint allows at most 256 bytes of URI. */
export const MAX_NFT_URI_BYTES = 256;

const ALLOWED_PROTOCOLS = new Set(["https:", "http:", "ipfs:"]);

/**
 * Hex-encodes an absolute URL for the NFTokenMint URI field.
 * The URL is stored exactly as given. Throws if it is not an absolute http, https, or ipfs URL,
 * contains whitespace, or is longer than 256 bytes.
 */
export function encodeNftUri(url: string): string {
  if (/\s/.test(url)) throw new TypeError(`NFT URI must not contain whitespace: "${url}"`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`NFT URI must be an absolute URL: "${url}"`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new TypeError(`NFT URI protocol ${parsed.protocol} is not allowed: "${url}"`);
  }
  const bytes = Buffer.byteLength(url, "utf8");
  if (bytes > MAX_NFT_URI_BYTES) {
    throw new RangeError(`NFT URI is ${bytes} bytes. The limit is ${MAX_NFT_URI_BYTES}.`);
  }
  return convertStringToHex(url);
}

export function decodeNftUri(hex: string): string {
  return convertHexToString(hex);
}
