import type { TxPendingEvent } from "../shared-types.js";
import { describe, expect, it, vi } from "vitest";
import { LedgerEventEmitter } from "../events.js";

const pending: TxPendingEvent = {
  hash: "H",
  kind: "task.mint",
  txType: "NFTokenMint",
  account: "r1",
  taskId: "t1",
  explorerUrl: "https://testnet.xrpl.org/transactions/H",
};

describe("LedgerEventEmitter", () => {
  it("delivers payloads to listeners of that event only", () => {
    const emitter = new LedgerEventEmitter();
    const onPending = vi.fn();
    const onValidated = vi.fn();
    emitter.on("tx.pending", onPending);
    emitter.on("tx.validated", onValidated);
    emitter.emit("tx.pending", pending);
    expect(onPending).toHaveBeenCalledWith(pending);
    expect(onValidated).not.toHaveBeenCalled();
  });

  it("removes listeners with the returned function and with off", () => {
    const emitter = new LedgerEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    const offA = emitter.on("tx.pending", a);
    emitter.on("tx.pending", b);
    offA();
    emitter.off("tx.pending", b);
    emitter.emit("tx.pending", pending);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(emitter.listenerCount("tx.pending")).toBe(0);
  });

  it("runs once listeners one time", () => {
    const emitter = new LedgerEventEmitter();
    const listener = vi.fn();
    emitter.once("tx.pending", listener);
    emitter.emit("tx.pending", pending);
    emitter.emit("tx.pending", pending);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps going when a listener throws and reports the error", () => {
    const onError = vi.fn();
    const emitter = new LedgerEventEmitter(onError);
    const after = vi.fn();
    emitter.on("tx.pending", () => {
      throw new Error("boom");
    });
    emitter.on("tx.pending", after);
    expect(() => emitter.emit("tx.pending", pending)).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "tx.pending");
  });
});
