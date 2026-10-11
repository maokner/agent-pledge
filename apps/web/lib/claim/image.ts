/**
 * How the claim page shrinks a seat photo before upload, so it goes up
 * quickly on a weak phone signal. 1600 px is plenty for the board.
 */

export const MAX_EDGE_PX = 1600;
/** A photo at or under this size and in a web format is sent as it is. */
export const KEEP_MAX_BYTES = 1024 * 1024;
export const JPEG_QUALITY = 0.82;

const WEB_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImageInfo {
  width: number;
  height: number;
  bytes: number;
  /** MIME type, for example "image/jpeg". */
  type: string;
}

export type ResizePlan =
  | { resize: false }
  | { resize: true; width: number; height: number; type: "image/jpeg"; quality: number };

export function planResize({ width, height, bytes, type }: ImageInfo): ResizePlan {
  if (width <= 0 || height <= 0) return { resize: false };
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_EDGE_PX && bytes <= KEEP_MAX_BYTES && WEB_TYPES.has(type)) return { resize: false };
  const scale = Math.min(1, MAX_EDGE_PX / longEdge);
  return {
    resize: true,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    type: "image/jpeg",
    quality: JPEG_QUALITY,
  };
}
