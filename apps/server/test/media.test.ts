import {
  PhotoResponse,
  ScreenshotResponse,
  type BoardEvent,
  type BoardEventData,
} from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueHelperToken } from "../src/auth";
import { subtasks } from "../src/db/schema";
import { agentHeaders, buildTestApp, insertTask, type TestApp } from "./helpers";
import { jpegWithGps, multipart, smallPng } from "./multipart";

let t: TestApp;
let events: BoardEvent[];
beforeEach(async () => {
  t = await buildTestApp({ config: { MAX_UPLOAD_BYTES: String(2 * 1024 * 1024) } });
  events = [];
  t.bus.subscribe((e) => events.push(e));
});
afterEach(() => t.close());

/** An open sub-task claimed through the API; returns its code, id, and helper token. */
async function claimed() {
  const f = await insertTask(t.app, { status: "claimed", subtask: "open" });
  const s = f.subtasks[0]!.subtask;
  const res = await t.app.inject({ method: "POST", url: `/claim/${s.claimCode}/claim` });
  expect(res.statusCode).toBe(200);
  return {
    code: s.claimCode,
    id: s.id,
    taskId: s.taskId,
    token: res.json().helper_token as string,
  };
}

function uploadPhoto(code: string, headers: Record<string, string>, body = multipart({})) {
  return t.app.inject({
    method: "POST",
    url: `/claim/${code}/photo`,
    payload: body.payload,
    headers: { ...body.headers, ...headers },
  });
}

/** Path of a media URL (http://api.test/media/<id> -> /media/<id>). */
const pathOf = (url: string) => new URL(url).pathname;

describe("POST /claim/:code/photo", () => {
  it("stores the photo and note, emits photo.added with a working /media URL, strips EXIF", async () => {
    const c = await claimed();
    const input = await jpegWithGps();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.orientation).toBe(6);
    expect(inMeta.exif?.toString("latin1")).toContain("TestCam");
    expect(inMeta.exif!.length).toBeGreaterThan(50); // includes the GPS IFD
    const body = multipart({ note: "Front table, left side" }, { buffer: input });
    const res = await uploadPhoto(c.code, { authorization: `Bearer ${c.token}` }, body);
    expect(res.statusCode).toBe(200);
    const r = PhotoResponse.parse(res.json());
    expect(r.claim.helper_note).toBe("Front table, left side");
    expect(r.claim.photo?.id).toBe(r.media!.id);

    const ev = events.find((e) => e.type === "photo.added");
    const data = ev!.data as BoardEventData["photo.added"];
    expect(data).toMatchObject({
      task_id: c.taskId,
      subtask_id: c.id,
      helper_note: "Front table, left side",
    });
    expect(data.media!.url).toBe(`http://api.test/media/${r.media!.id}`);

    const img = await t.app.inject({ url: pathOf(data.media!.url) });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(img.headers["cache-control"]).toContain("immutable");
    const meta = await sharp(img.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // 2000x1000 with orientation 6 -> upright 1000x2000, within 1280 px wide: unchanged size.
    expect([meta.width, meta.height]).toEqual([1000, 2000]);
    expect(data.media).toMatchObject({ width: 1000, height: 2000, mime_type: "image/jpeg" });
  });

  it("resizes wide images to at most 1280 px", async () => {
    const c = await claimed();
    const wide = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#000" },
    })
      .jpeg()
      .toBuffer();
    const res = await uploadPhoto(
      c.code,
      { "x-helper-token": c.token },
      multipart({}, { buffer: wide }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().media).toMatchObject({ width: 1280, height: 640 });
  });

  it("accepts a note alone and keeps the earlier photo (PIN mode, so the photo does not pay)", async () => {
    await t.close();
    t = await buildTestApp({ config: { PROOF_MODE: "pin" } });
    t.bus.subscribe((e) => events.push(e));
    const c = await claimed();
    await uploadPhoto(
      c.code,
      { "x-helper-token": c.token },
      multipart({}, { buffer: await smallPng(), contentType: "image/png" }),
    );
    events.length = 0;
    const res = await uploadPhoto(
      c.code,
      { "x-helper-token": c.token },
      multipart({ note: "By the window" }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().media).toBeNull();
    const data = events.find((e) => e.type === "photo.added")!
      .data as BoardEventData["photo.added"];
    expect(data.helper_note).toBe("By the window");
    expect(data.media).not.toBeNull();
  });

  it("rejects a non-claimer", async () => {
    const c = await claimed();
    const body = () => multipart({ note: "hi" });
    // No token.
    expect((await uploadPhoto(c.code, {}, body())).statusCode).toBe(401);
    // A valid token for another sub-task.
    const other = await claimed();
    expect((await uploadPhoto(c.code, { "x-helper-token": other.token }, body())).statusCode).toBe(
      401,
    );
    // A token signed for this sub-task but a different wallet (not the helper who claimed).
    const forged = issueHelperToken(t.config, c.id, "wal_someoneelse0000");
    expect((await uploadPhoto(c.code, { "x-helper-token": forged }, body())).statusCode).toBe(401);
    expect(events.filter((e) => e.type === "photo.added")).toHaveLength(0);
  });

  it("410 after the deadline, 400 on empty or non-image uploads, 413 over the limit", async () => {
    const c = await claimed();
    const h = { "x-helper-token": c.token };
    expect((await uploadPhoto(c.code, h, multipart({}))).statusCode).toBe(400);
    expect(
      (await uploadPhoto(c.code, h, multipart({}, { buffer: Buffer.from("not an image") })))
        .statusCode,
    ).toBe(400);
    const big = await uploadPhoto(
      c.code,
      h,
      multipart({}, { buffer: Buffer.alloc(3 * 1024 * 1024, 1) }),
    );
    expect(big.statusCode).toBe(413);
    t.clock.advance(11 * 60_000);
    expect((await uploadPhoto(c.code, h, multipart({ note: "late" }))).statusCode).toBe(410);
  });
});

describe("POST /agent/subtasks/:id/screenshot", () => {
  it("stores the screenshot, sets post text and time, emits yikyak.posted", async () => {
    const f = await insertTask(t.app, { status: "claimed", subtask: "open", yikyak: false });
    const s = f.subtasks[0]!.subtask;
    const body = multipart(
      { post_text: "$4 to save a seat. First to claim: http://board.test/c/ABCD" },
      { buffer: await smallPng(), contentType: "image/png", filename: "yak.png" },
    );
    const unauth = await t.app.inject({
      method: "POST",
      url: `/agent/subtasks/${s.id}/screenshot`,
      payload: body.payload,
      headers: body.headers,
    });
    expect(unauth.statusCode).toBe(401);

    const res = await t.app.inject({
      method: "POST",
      url: `/agent/subtasks/${s.id}/screenshot`,
      payload: body.payload,
      headers: { ...body.headers, ...agentHeaders },
    });
    expect(res.statusCode).toBe(200);
    const r = ScreenshotResponse.parse(res.json());
    expect(r.subtask.yikyak_screenshot?.id).toBe(r.media.id);
    expect(r.subtask.post_text).toContain("save a seat");
    expect(r.subtask.yikyak_posted_at).toBe(t.clock.now().toISOString());

    const ev = events.find((e) => e.type === "yikyak.posted");
    expect(ev?.data).toMatchObject({
      task_id: s.taskId,
      subtask_id: s.id,
      media: { id: r.media.id, kind: "yikyak_screenshot" },
      post_text: r.subtask.post_text,
    });
    const [row] = await t.db.select().from(subtasks).where(eq(subtasks.id, s.id));
    expect(row!.yikyakScreenshotMediaId).toBe(r.media.id);
    expect((await t.app.inject({ url: pathOf(r.media.url) })).statusCode).toBe(200);
  });

  it("404 for an unknown sub-task, 400 without a file", async () => {
    const f = await insertTask(t.app, { status: "claimed", subtask: "open" });
    const s = f.subtasks[0]!.subtask;
    const noFile = multipart({ post_text: "hi" });
    const res = await t.app.inject({
      method: "POST",
      url: `/agent/subtasks/${s.id}/screenshot`,
      payload: noFile.payload,
      headers: { ...noFile.headers, ...agentHeaders },
    });
    expect(res.statusCode).toBe(400);
    const missing = await t.app.inject({
      method: "POST",
      url: `/agent/subtasks/sub_nope/screenshot`,
      payload: noFile.payload,
      headers: { ...noFile.headers, ...agentHeaders },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe("GET /media/:id", () => {
  it("404s on unknown media", async () => {
    expect((await t.app.inject({ url: "/media/med_nope" })).statusCode).toBe(404);
  });
});
