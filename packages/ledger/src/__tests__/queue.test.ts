import { describe, expect, it } from "vitest";
import { runExclusive } from "../queue.js";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("runExclusive", () => {
  it("runs tasks with the same key one after another, in call order", async () => {
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`start ${name}`);
      await tick(ms);
      events.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([
      runExclusive("a", task("1", 10)),
      runExclusive("a", task("2", 1)),
    ]);
    expect(results).toEqual(["1", "2"]);
    expect(events).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });

  it("runs tasks with different keys at the same time", async () => {
    const events: string[] = [];
    await Promise.all([
      runExclusive("x", async () => {
        events.push("start x");
        await tick(10);
        events.push("end x");
      }),
      runExclusive("y", async () => {
        events.push("start y");
      }),
    ]);
    expect(events.indexOf("start y")).toBeLessThan(events.indexOf("end x"));
  });

  it("keeps going after a task fails", async () => {
    const failed = runExclusive("b", async () => {
      throw new Error("boom");
    });
    const next = runExclusive("b", async () => "ok");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
