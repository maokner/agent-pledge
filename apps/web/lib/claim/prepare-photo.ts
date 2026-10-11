/**
 * Browser side of the photo step: decode the picked photo, shrink it with
 * planResize, and re-encode it as JPEG. Re-encoding also drops EXIF data
 * such as GPS location (the server strips it too, #22).
 */
import { planResize } from "./image";

/**
 * The server refuses uploads over 8 MB (413), so a photo the browser cannot
 * shrink is refused here above that, rather than sent over a weak signal first.
 */
export const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;

export class PhotoError extends Error {
  override name = "PhotoError";
}

/** The photo as picked, if the server will take it. */
function original(file: File): File {
  if (file.size > MAX_ORIGINAL_BYTES) throw new PhotoError("This photo is too big to send. Try taking a new one.");
  return file;
}

export async function preparePhoto(file: File): Promise<File> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new PhotoError("That file is not a photo. Choose a photo of the seat.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // This browser cannot read the format (for example HEIC outside Safari). Send it as it is.
    return original(file);
  }

  try {
    const plan = planResize({ width: bitmap.width, height: bitmap.height, bytes: file.size, type: file.type });
    if (!plan.resize) return original(file);

    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const context = canvas.getContext("2d");
    if (!context) return original(file);
    context.drawImage(bitmap, 0, 0, plan.width, plan.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, plan.type, plan.quality));
    if (!blob) return original(file);
    return new File([blob], "seat-photo.jpg", { type: plan.type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
