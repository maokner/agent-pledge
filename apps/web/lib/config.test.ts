import { describe, expect, it } from "vitest";
import { apiUrlFrom, LOCAL_API_URL } from "./config";

describe("apiUrlFrom", () => {
  it("defaults to the page's own origin, which the server proxies", () => {
    expect(apiUrlFrom({})).toBe("");
  });

  it("uses NEXT_PUBLIC_API_URL when set, without a trailing slash; empty means same origin", () => {
    expect(apiUrlFrom({ NEXT_PUBLIC_API_URL: "https://api.example/" })).toBe("https://api.example");
    expect(apiUrlFrom({ NEXT_PUBLIC_API_URL: LOCAL_API_URL })).toBe("http://localhost:3001");
    expect(apiUrlFrom({ NEXT_PUBLIC_API_URL: "" })).toBe("");
  });
});
