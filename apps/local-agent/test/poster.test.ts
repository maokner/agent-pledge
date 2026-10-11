import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LogInput } from "../src/api";
import { ComputerUseDriver, createDriver, renderCardHtml } from "../src/yikyak/drivers";
import { YikYakPoster, type PostJob } from "../src/yikyak/poster";
import { FakeDriver } from "./mock-server";

const TEN_MIN = 10 * 60_000;
let dir: string;
let clock: number;
const logs: LogInput[] = [];
const uploads: PostJob[] = [];

async function open(driver: FakeDriver): Promise<YikYakPoster> {
  return YikYakPoster.open({
    driver,
    stateFile: path.join(dir, "yikyak-state.json"),
    minIntervalMs: TEN_MIN,
    now: () => clock,
    log: async (l) => void logs.push(l),
    onPosted: async (job) => {
      uploads.push(job);
      return "http://api.test/media/x";
    },
  });
}

const job = (n: number) => ({ task_id: `task_${n}`, subtask_id: `sub_${n}`, text: `post ${n}` });

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "poster-test-"));
  clock = Date.parse("2026-10-11T18:00:00Z");
  logs.length = 0;
  uploads.length = 0;
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("Yik Yak rate limit", () => {
  it("queues a second post within 10 minutes, survives a restart, and posts when the slot opens", async () => {
    const driver = new FakeDriver(path.join(dir, "shots"));
    const p1 = await open(driver);
    const first = await p1.submit(job(1));
    expect(first.status).toBe("posted");
    clock += 60_000;
    const second = await p1.submit(job(2));
    expect(second).toMatchObject({
      status: "queued",
      position: 1,
      earliest_post_at: "2026-10-11T18:10:00.000Z",
    });
    expect(driver.posts).toEqual(["post 1"]);
    expect(logs.some((l) => l.message.includes("queued post #1"))).toBe(true);
    await p1.close();

    // Restart: a new poster reads the state file and still respects the limit.
    const state = JSON.parse(await readFile(path.join(dir, "yikyak-state.json"), "utf8"));
    expect(state.queue).toHaveLength(1);
    clock += 60_000;
    const p2 = await open(driver);
    expect(p2.lastPostAt).toBe(Date.parse("2026-10-11T18:00:00Z"));
    const third = await p2.submit(job(3));
    expect(third).toMatchObject({ status: "queued", position: 2 });
    await p2.drain();
    expect(driver.posts).toEqual(["post 1"]); // still too early

    clock = Date.parse("2026-10-11T18:10:00Z");
    await p2.drain();
    expect(driver.posts).toEqual(["post 1", "post 2"]);
    expect(uploads.map((u) => u.subtask_id)).toEqual(["sub_1", "sub_2"]);
    expect(p2.queued).toHaveLength(1);

    clock += 5 * 60_000;
    await p2.drain();
    expect(driver.posts).toHaveLength(2); // one post per 10 minutes
    clock += 5 * 60_000;
    await p2.drain();
    expect(driver.posts).toEqual(["post 1", "post 2", "post 3"]);
    await p2.close();
  });

  it("drops a queued post whose deadline passed", async () => {
    const driver = new FakeDriver(path.join(dir, "shots"));
    const p = await open(driver);
    await p.submit(job(1));
    await p.submit({ ...job(2), deadline: new Date(clock + 60_000).toISOString() });
    clock += TEN_MIN;
    await p.drain();
    expect(driver.posts).toEqual(["post 1"]);
    expect(logs.some((l) => l.message.startsWith("Dropped queued Yik Yak post"))).toBe(true);
    await p.close();
  });

  it("does not rate limit the render driver (not a real post) and says so in the log", async () => {
    const driver = new FakeDriver(path.join(dir, "shots"), false);
    const p = await open(driver);
    expect((await p.submit(job(1))).status).toBe("posted");
    expect((await p.submit(job(2))).status).toBe("posted");
    expect(logs.filter((l) => l.message.includes("NOT a real Yik Yak post"))).toHaveLength(2);
    await p.close();
  });
});

describe("drivers", () => {
  it("computer-use is a stub that points at #28", async () => {
    await expect(new ComputerUseDriver().post("x")).rejects.toThrow(/not implemented, see #28/);
  });

  it("picks the driver from config and escapes the render card", () => {
    const base = {
      minIntervalMs: 1,
      url: "",
      composeSelector: "",
      textSelector: "",
      submitSelector: "",
      profileDir: dir,
      browserChannel: "",
      postWaitMs: 0,
    };
    expect(createDriver({ ...base, driver: "render" }, dir)).toMatchObject({
      name: "render",
      real: false,
    });
    expect(createDriver({ ...base, driver: "playwright" }, dir)).toMatchObject({
      name: "playwright",
      real: true,
    });
    expect(renderCardHtml("<b>$4</b>")).toContain("&#60;b&#62;$4");
  });
});
