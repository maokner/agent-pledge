import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalAgent } from "../src/agent";
import { DEFAULT_STATE_DIR, loadConfig, type AgentConfig } from "../src/config";
import { FakeDriver, MockServer, TOKEN, makeTask, waitFor } from "./mock-server";

let server: MockServer;
let dir: string;
let agent: LocalAgent | null;

function testConfig(over: Record<string, string> = {}): AgentConfig {
  return loadConfig({
    SERVER_URL: server.url,
    SERVER_WS_URL: server.wsUrl,
    AGENT_TOKEN: TOKEN,
    AGENT_MODE: "scripted",
    LEDGER_MODE: "fake",
    AGENT_STATE_DIR: dir,
    ...over,
  });
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "local-agent-test-"));
  server = await new MockServer().start();
  agent = null;
});

afterEach(async () => {
  await agent?.stop();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});

describe("local agent (scripted mode, fake ledger)", () => {
  it("defaults to scripted without an API key and llm with one", () => {
    expect(loadConfig({}).agentMode).toBe("scripted");
    expect(loadConfig({ ANTHROPIC_API_KEY: "x" }).agentMode).toBe("llm");
    expect(loadConfig({ SERVER_URL: "https://api.example.com" }).wsUrl).toBe(
      "wss://api.example.com/ws/agent",
    );
    // Empty .env values mean "default".
    const blank = loadConfig({ AGENT_STATE_DIR: "", AGENT_MODE: "", YIKYAK_PROFILE_DIR: "" });
    expect(blank.stateDir).toBe(DEFAULT_STATE_DIR);
    expect(blank.yikyak.profileDir).toBe(path.join(DEFAULT_STATE_DIR, "chrome-profile"));
  });

  it("acks, claims, creates the sub-task at 80% rounded down, posts, uploads, logs, then redeems", async () => {
    const driver = new FakeDriver(path.join(dir, "shots"));
    agent = await LocalAgent.create(testConfig(), { driver, ledger: null });
    agent.start();
    await waitFor(() => server.rec.hellos.length === 1, 5000, "hello");

    const task = makeTask({ price: "5.00" });
    server.pushTask(task);
    await waitFor(() => server.rec.screenshots.length === 1, 5000, "screenshot upload");

    expect(server.rec.acks).toContain(task.id);
    expect(server.rec.claims).toEqual([{ id: task.id, body: {} }]); // fake mode: no tx hash
    expect(server.rec.subtasks).toHaveLength(1);
    expect(server.rec.subtasks[0]!.body).toEqual({ price: "4.00" });
    const shot = server.rec.screenshots[0]!;
    expect(shot.bytes).toBeGreaterThan(0);
    expect(shot.post_text).toContain("http://board.test/c/");
    expect(shot.post_text).toContain("$4");
    expect(shot.post_text).toContain("Main Stacks");
    expect(driver.posts).toEqual([shot.post_text]);
    const messages = server.rec.logs.map((l) => l.message);
    expect(messages).toContain(
      "Sub-task price: 4.00 (80% of 5.00). Policy: 80% of the task price, rounded down to the nearest 0.50",
    );
    expect(server.rec.logs.some((l) => l.level === "decision")).toBe(true);

    server.broadcast({
      type: "task.redeemable",
      task_id: task.id,
      subtask_id: "sub_0000000000000001",
      nft_id: "NFT1",
      amount: "6.00",
      vault_address: "rVault",
    });
    await waitFor(() => server.rec.redeems.length === 1, 5000, "redeem");
    expect(server.rec.redeems[0]).toEqual({ id: task.id, body: {} });
    await agent.idle();
    expect(
      server.rec.logs.some((l) => l.message.startsWith("Redeemed the task NFT for 6.00")),
    ).toBe(true);
  });

  it("rounds 7.00 down to 5.50 and handles tasks one at a time", async () => {
    const driver = new FakeDriver(path.join(dir, "shots"), false); // not rate limited
    agent = await LocalAgent.create(testConfig(), { driver, ledger: null });
    agent.start();
    await waitFor(() => server.rec.hellos.length === 1);
    server.pushTask(makeTask({ price: "7.00" }));
    server.pushTask(makeTask({ price: "5.00" }));
    await waitFor(() => server.rec.screenshots.length === 2, 5000, "two uploads");
    expect(server.rec.subtasks.map((s) => s.body.price)).toEqual(["5.50", "4.00"]);
  });

  it("reconnects after a drop and gets un-acked tasks again", async () => {
    const driver = new FakeDriver(path.join(dir, "shots"));
    agent = await LocalAgent.create(testConfig(), { driver, ledger: null, minBackoffMs: 50 });
    agent.start();
    await waitFor(() => server.rec.hellos.length === 1);
    server.dropAll();
    await waitFor(() => server.rec.hellos.length === 2, 5000, "second hello");
    // A task created while the agent was connected again is handled.
    const task = makeTask();
    server.pushTask(task);
    await waitFor(() => server.rec.screenshots.length === 1, 5000, "upload after reconnect");
    expect(server.rec.acks).toContain(task.id);
  });

  it("does not handle the same task twice when task.new is resent", async () => {
    const driver = new FakeDriver(path.join(dir, "shots"));
    agent = await LocalAgent.create(testConfig(), { driver, ledger: null });
    agent.start();
    await waitFor(() => server.rec.hellos.length === 1);
    const task = makeTask();
    server.pushTask(task);
    server.broadcast({ type: "task.new", task });
    await waitFor(() => server.rec.screenshots.length === 1);
    await agent.idle();
    expect(server.rec.claims).toHaveLength(1);
  });
});
