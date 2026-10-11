// Owner: bundle C (#22). Store photos and Yik Yak screenshots in the media table (bytea): size limit,
// resize (sharp), strip EXIF (including GPS), width/height. Sets media.task_id AND media.subtask_id.
import type { MultipartFile } from "@fastify/multipart";
import { newId, type MediaKind, type MediaView } from "@agent-pledge/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { media, subtasks, type SubtaskRow } from "../db/schema";
import { badRequest, HttpError } from "../lib/http";
import { mediaMetaColumns, mediaToView } from "../lib/views";

export const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 82;

export interface ProcessedImage {
  bytes: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
}

/**
 * Auto-rotates by EXIF orientation, resizes to at most 1280 px wide, re-encodes as JPEG.
 * sharp drops all metadata (EXIF, GPS, XMP, ICC) unless asked to keep it, and we never ask.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const { data, info } = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, mimeType: "image/jpeg", width: info.width, height: info.height };
  } catch (err) {
    throw badRequest(`Not a supported image: ${(err as Error).message}`);
  }
}

/** Processes and stores an image; returns its MediaView. */
export async function storeImage(
  app: FastifyInstance,
  input: Buffer,
  meta: { kind: MediaKind; taskId: string; subtaskId: string },
): Promise<MediaView> {
  const img = await processImage(input);
  const id = newId("med");
  const [row] = await app.db
    .insert(media)
    .values({
      id,
      kind: meta.kind,
      taskId: meta.taskId,
      subtaskId: meta.subtaskId,
      mimeType: img.mimeType,
      bytes: img.bytes,
      sizeBytes: img.bytes.byteLength,
      width: img.width,
      height: img.height,
      createdAt: app.clock.now(),
    })
    .returning(mediaMetaColumns);
  return mediaToView(app.config, row!);
}

export interface MultipartUpload {
  file: Buffer | null;
  fields: Record<string, string>;
}

/** Reads a multipart body: at most one file (field "file"), plus text fields. 413 over MAX_UPLOAD_BYTES. */
export async function readUpload(req: FastifyRequest): Promise<MultipartUpload> {
  if (!req.isMultipart()) throw badRequest("Expected multipart/form-data");
  let file: Buffer | null = null;
  const fields: Record<string, string> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buf = await readFile(part);
      if (part.fieldname === "file" && buf.byteLength > 0) file = buf;
    } else if (typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
  }
  return { file, fields };
}

async function readFile(part: MultipartFile): Promise<Buffer> {
  try {
    const buf = await part.toBuffer();
    if (part.file.truncated) throw tooLarge();
    return buf;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") throw tooLarge();
    throw err;
  }
}

const tooLarge = () => new HttpError(413, "payload_too_large", "The image is too large");

/** Helper's seat photo and/or note: store, update the sub-task, broadcast photo.added. */
export async function addHelperPhoto(
  app: FastifyInstance,
  s: SubtaskRow,
  upload: { file: Buffer | null; note: string | undefined },
): Promise<MediaView | null> {
  const note = upload.note?.trim() || undefined;
  if (!upload.file && !note) throw badRequest("Send a photo, a note, or both");
  const view = upload.file
    ? await storeImage(app, upload.file, { kind: "photo", taskId: s.taskId, subtaskId: s.id })
    : null;
  const [row] = await app.db
    .update(subtasks)
    .set({
      ...(view ? { photoMediaId: view.id } : {}),
      ...(note ? { helperNote: note } : {}),
      updatedAt: app.clock.now(),
    })
    .where(eq(subtasks.id, s.id))
    .returning({ helperNote: subtasks.helperNote, photoMediaId: subtasks.photoMediaId });

  // Report the sub-task's current photo, so a note-only update still carries the earlier photo.
  let current = view;
  if (!current && row?.photoMediaId) {
    const [m] = await app.db
      .select(mediaMetaColumns)
      .from(media)
      .where(eq(media.id, row.photoMediaId));
    current = m ? mediaToView(app.config, m) : null;
  }
  app.bus.publish("photo.added", {
    task_id: s.taskId,
    subtask_id: s.id,
    media: current,
    helper_note: row?.helperNote ?? null,
  });
  return view;
}

/** The local agent's Yik Yak screenshot: store, update the sub-task, broadcast yikyak.posted. */
export async function addYikyakScreenshot(
  app: FastifyInstance,
  s: SubtaskRow,
  input: { file: Buffer; postText: string; postedAt: Date },
): Promise<MediaView> {
  const view = await storeImage(app, input.file, {
    kind: "yikyak_screenshot",
    taskId: s.taskId,
    subtaskId: s.id,
  });
  await app.db
    .update(subtasks)
    .set({
      yikyakScreenshotMediaId: view.id,
      postText: input.postText,
      yikyakPostedAt: input.postedAt,
      updatedAt: app.clock.now(),
    })
    .where(eq(subtasks.id, s.id));
  app.bus.publish("yikyak.posted", {
    task_id: s.taskId,
    subtask_id: s.id,
    media: view,
    post_text: input.postText,
    posted_at: input.postedAt.toISOString(),
  });
  return view;
}

/** Bytes for GET /media/:id. */
export async function getMediaBytes(
  app: FastifyInstance,
  id: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const [m] = await app.db
    .select({ bytes: media.bytes, mimeType: media.mimeType })
    .from(media)
    .where(eq(media.id, id));
  return m ?? null;
}
