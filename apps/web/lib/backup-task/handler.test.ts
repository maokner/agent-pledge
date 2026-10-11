import type { CreateTaskRequest, CreateTaskResponse } from "@/lib/contract";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { BACKUP_PASSCODE_HEADER, createTaskSender, handleBackupTask, readBackupTaskConfig, type BackupTaskConfig } from "./handler";

const body = {
  description: "Save me a seat at the front table",
  place: "Main Stacks, front table",
  time_limit_minutes: 3,
  price_usd: 5,
};

const serverConfig: BackupTaskConfig = {
  mode: "server",
  passcode: "open sesame",
  serverUrl: "https://api.example",
  voiceSecret: "s3cret",
  callerPhone: "+15555550100",
};

function post(json: unknown, passcode?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (passcode !== undefined) headers[BACKUP_PASSCODE_HEADER] = passcode;
  return new Request("http://board.example/api/backup-task", {
    method: "POST",
    headers,
    body: typeof json === "string" ? json : JSON.stringify(json),
  });
}

function created() {
  return vi.fn<(req: CreateTaskRequest) => Promise<CreateTaskResponse>>(async () => ({ task_id: "tsk_1", pin: "4821", board_url: "https://board.example" }));
}

describe("handleBackupTask", () => {
  it("with the right passcode, sends the same create_task call as the voice agent and returns the PIN", async () => {
    const createTask = created();

    const response = await handleBackupTask(post(body, "open sesame"), { config: serverConfig, createTask });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ task_id: "tsk_1", pin: "4821", board_url: "https://board.example" });
    expect(createTask).toHaveBeenCalledWith({ ...body, caller_phone: "+15555550100" });
  });

  it("refuses a missing or wrong passcode without calling the server", async () => {
    const createTask = created();

    const missing = await handleBackupTask(post(body), { config: serverConfig, createTask });
    const wrong = await handleBackupTask(post(body, "open sesame!"), { config: serverConfig, createTask });

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ error: "unauthorized" });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("says which fields are wrong", async () => {
    const createTask = created();

    const response = await handleBackupTask(post({ ...body, price_usd: -1 }, "open sesame"), { config: serverConfig, createTask });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request", fields: { price_usd: expect.any(String) } });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await handleBackupTask(post("{nope", "open sesame"), { config: serverConfig, createTask: created() });

    expect(response.status).toBe(400);
  });

  it("is switched off until the passcode, server URL and voice secret are all set", async () => {
    const createTask = created();

    const response = await handleBackupTask(post(body, ""), { config: { ...serverConfig, passcode: null }, createTask });

    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/BACKUP_FORM_PASSCODE/);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("in fixture mode needs no passcode unless one is set", async () => {
    const fixtures: BackupTaskConfig = { ...serverConfig, mode: "fixtures", passcode: null, serverUrl: null, voiceSecret: null };

    const open = await handleBackupTask(post(body), { config: fixtures, createTask: created() });
    const locked = await handleBackupTask(post(body), { config: { ...fixtures, passcode: "pw" }, createTask: created() });

    expect(open.status).toBe(200);
    expect(locked.status).toBe(401);
  });

  it("passes the server's own errors through, except a rejected secret, which is our setup problem", async () => {
    const rejecting = (error: unknown) => vi.fn(async () => Promise.reject(error));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const invalid = await handleBackupTask(post(body, "open sesame"), {
      config: serverConfig,
      createTask: rejecting(new ApiError(400, "bad_request", "Right now I can only save seats.")),
    });
    const badSecret = await handleBackupTask(post(body, "open sesame"), {
      config: serverConfig,
      createTask: rejecting(new ApiError(401, "unauthorized", "Bad secret")),
    });
    const down = await handleBackupTask(post(body, "open sesame"), {
      config: serverConfig,
      createTask: rejecting(new TypeError("fetch failed")),
    });

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "bad_request", message: "Right now I can only save seats." });
    expect(badSecret.status).toBe(502);
    expect((await badSecret.json()).message).toMatch(/AGENT_PLEDGE_VOICE_SECRET/);
    expect(down.status).toBe(502);
  });

  it("sends no caller_phone when neither the form nor the env has one (the server's is optional)", async () => {
    const createTask = created();

    await handleBackupTask(post(body, "open sesame"), { config: { ...serverConfig, callerPhone: null }, createTask });

    expect(createTask).toHaveBeenCalledWith(body);
  });

  it("shows the server's 422 not_seat_hold message, also next to the description", async () => {
    const message = "Right now I can only save seats. This task is not a seat hold.";
    const response = await handleBackupTask(post(body, "open sesame"), {
      config: serverConfig,
      createTask: vi.fn(async () => Promise.reject(new ApiError(422, "not_seat_hold", message))),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "not_seat_hold", message, fields: { description: message } });
  });
});

describe("createTaskSender", () => {
  it("posts to the server's create_task with the voice secret header", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ task_id: "tsk_1", pin: "4821", board_url: "https://board.example" }),
    );
    const send = createTaskSender(serverConfig, fetch);

    const result = await send({ ...body, caller_phone: "+15555550100" });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/tools/create_task");
    expect(new Headers(init?.headers).get("x-agent-pledge-secret")).toBe("s3cret");
    expect(JSON.parse(String(init?.body))).toEqual({ ...body, caller_phone: "+15555550100" });
    expect(result.pin).toBe("4821");
  });
});

describe("readBackupTaskConfig", () => {
  it("reads the server-only settings", () => {
    expect(
      readBackupTaskConfig({
        BACKUP_FORM_PASSCODE: "pw",
        AGENT_PLEDGE_SERVER_URL: "https://api.example/",
        AGENT_PLEDGE_VOICE_SECRET: "s3cret",
        BACKUP_FORM_CALLER_PHONE: "+15105550123",
      }),
    ).toEqual({
      mode: "server",
      passcode: "pw",
      serverUrl: "https://api.example",
      voiceSecret: "s3cret",
      callerPhone: "+15105550123",
    });
  });

  it("falls back to NEXT_PUBLIC_API_URL when it is absolute, and to no phone", () => {
    expect(readBackupTaskConfig({ NEXT_PUBLIC_API_URL: "http://localhost:3001" })).toMatchObject({
      serverUrl: "http://localhost:3001",
      passcode: null,
      callerPhone: null,
    });
    expect(readBackupTaskConfig({ NEXT_PUBLIC_API_URL: "" }).serverUrl).toBeNull();
    expect(readBackupTaskConfig({}).serverUrl).toBe("http://localhost:3001");
    expect(readBackupTaskConfig({ NEXT_PUBLIC_FIXTURES: "1" }).mode).toBe("fixtures");
  });
});
