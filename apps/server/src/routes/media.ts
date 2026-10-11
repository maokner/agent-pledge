// Owner: bundle C (#22).
// GET /media/:id -> the image bytes from the media table, with its mime type and a long
// Cache-Control (media is immutable). Public, no auth.
// POST /agent/subtasks/:id/screenshot (agent token) -> the local agent's Yik Yak screenshot.
import { ScreenshotFields, type ScreenshotResponse } from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { requireAgentToken } from "../auth";
import { subtasks } from "../db/schema";
import { badRequest, notFound, parseOrThrow } from "../lib/http";
import { loadSubtaskView } from "../lib/views";
import { addYikyakScreenshot, getMediaBytes, readUpload } from "../services/media";

const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/media/:id", async (req, reply) => {
    const m = await getMediaBytes(app, req.params.id);
    if (!m) throw notFound("Unknown media");
    return reply
      .header("Content-Type", m.mimeType)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("ETag", `"${req.params.id}"`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
      .header("Cross-Origin-Resource-Policy", "cross-origin")
      .send(Buffer.from(m.bytes));
  });

  app.post<{ Params: { id: string } }>(
    "/agent/subtasks/:id/screenshot",
    { preHandler: requireAgentToken },
    async (req) => {
      const [s] = await app.db.select().from(subtasks).where(eq(subtasks.id, req.params.id));
      if (!s) throw notFound("Unknown sub-task");
      const upload = await readUpload(req);
      if (!upload.file) throw badRequest("Missing file");
      const fields = parseOrThrow(ScreenshotFields, {
        post_text: upload.fields.post_text,
        posted_at: upload.fields.posted_at || undefined,
      });
      const media = await addYikyakScreenshot(app, s, {
        file: upload.file,
        postText: fields.post_text,
        postedAt: fields.posted_at ? new Date(fields.posted_at) : app.clock.now(),
      });
      const subtask = await loadSubtaskView(app.db, app.viewCtx, s.id);
      const body: ScreenshotResponse = { media, subtask: subtask! };
      return body;
    },
  );
};

export default mediaRoutes;
