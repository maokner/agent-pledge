import { describe, expect, it, vi } from "vitest";
import type { Client } from "xrpl";
import { backoffDelay, ensureConnected } from "../client.js";
import { NetworkError } from "../errors.js";

describe("backoffDelay", () => {
  it("grows exponentially with jitter and caps at 15 s", () => {
    expect(backoffDelay(0, () => 0)).toBe(250);
    expect(backoffDelay(0, () => 1)).toBe(500);
    expect(backoffDelay(3, () => 1)).toBe(4000);
    expect(backoffDelay(20, () => 1)).toBe(15000);
    expect(backoffDelay(20, () => 0)).toBe(7500);
  });
});

describe("ensureConnected", () => {
  it("returns at once when connected", async () => {
    const connect = vi.fn();
    await ensureConnected({ isConnected: () => true, connect } as unknown as Client);
    expect(connect).not.toHaveBeenCalled();
  });

  it("retries connect until it works", async () => {
    let connected = false;
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("refused"))
      .mockImplementationOnce(async () => {
        connected = true;
      });
    const client = { isConnected: () => connected, connect, url: "wss://x" } as unknown as Client;
    await ensureConnected(client, { timeoutMs: 5_000 });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("throws NetworkError after the timeout", async () => {
    const client = {
      isConnected: () => false,
      connect: vi.fn().mockRejectedValue(new Error("refused")),
      url: "wss://x",
    } as unknown as Client;
    await expect(ensureConnected(client, { timeoutMs: 300 })).rejects.toBeInstanceOf(NetworkError);
  });
});
