import { describe, expect, it } from "vitest";
import { apiUrlFrom } from "./config";

describe("apiUrlFrom", () => {
  it("defaults to the server's local port outside fixture mode", () => {
    expect(apiUrlFrom({})).toBe("http://localhost:3001");
  });

  it("needs no server in fixture mode", () => {
    expect(apiUrlFrom({ NEXT_PUBLIC_FIXTURES: "1" })).toBe("");
  });

  it("uses NEXT_PUBLIC_API_URL when set, without a trailing slash; empty means same origin", () => {
    expect(apiUrlFrom({ NEXT_PUBLIC_API_URL: "https://api.example/" })).toBe("https://api.example");
    expect(apiUrlFrom({ NEXT_PUBLIC_API_URL: "" })).toBe("");
  });
});
