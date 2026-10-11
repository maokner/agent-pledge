import { describe, expect, it, vi } from "vitest";
import { BackupTaskError, submitBackupTask } from "./client";

const form = {
  description: "Save me a seat",
  place: "Main Stacks",
  time_limit_minutes: "3",
  price_usd: "5",
  caller_phone: "",
};

describe("submitBackupTask", () => {
  it("posts the form and the passcode to the web app's route, and returns the PIN", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ task_id: "tsk_1", pin: "4821", board_url: "/board" }),
    );

    const result = await submitBackupTask(form, "pw", fetch);

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/backup-task");
    expect(new Headers(init?.headers).get("x-backup-passcode")).toBe("pw");
    expect(JSON.parse(String(init?.body))).toEqual(form);
    expect(result).toEqual({ task_id: "tsk_1", pin: "4821", board_url: "/board" });
  });

  it("throws the route's error with its per-field messages", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: "bad_request",
          message: "Some fields need fixing.",
          fields: { place: "Say where" },
        },
        { status: 400 },
      ),
    );

    const error = await submitBackupTask(form, "pw", fetch).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BackupTaskError);
    expect(error).toMatchObject({
      status: 400,
      code: "bad_request",
      fields: { place: "Say where" },
    });
  });

  it("throws a readable error when the response is not JSON", async () => {
    const fetch = vi.fn(async () => new Response("Bad gateway", { status: 502 }));

    await expect(submitBackupTask(form, "pw", fetch)).rejects.toMatchObject({
      status: 502,
      code: "internal",
    });
  });
});
