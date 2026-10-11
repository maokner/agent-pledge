import { describe, expect, it } from "vitest";
import { decodeNftUri, encodeNftUri, MAX_NFT_URI_BYTES } from "../uri.js";

describe("encodeNftUri", () => {
  it("hex-encodes the URL exactly as given", () => {
    expect(encodeNftUri("https://example.com/a")).toBe(
      "68747470733A2F2F6578616D706C652E636F6D2F61",
    );
    const url = "https://board.example/api/nft/subtasks/demo-1-s1?v=2";
    expect(decodeNftUri(encodeNftUri(url))).toBe(url);
  });

  it("allows exactly 256 bytes and rejects more", () => {
    const prefix = "https://example.com/";
    const atLimit = prefix + "a".repeat(MAX_NFT_URI_BYTES - prefix.length);
    expect(encodeNftUri(atLimit)).toHaveLength(MAX_NFT_URI_BYTES * 2);
    expect(() => encodeNftUri(`${atLimit}a`)).toThrow(RangeError);
  });

  it.each(["/api/nft/tasks/1", "not a url", "https://example.com/a b", "ftp://example.com/x", ""])(
    "rejects %j",
    (url) => {
      expect(() => encodeNftUri(url)).toThrow(TypeError);
    },
  );
});
