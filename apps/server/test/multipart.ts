import sharp from "sharp";

/** Builds a multipart/form-data body for app.inject. */
export function multipart(
  fields: Record<string, string>,
  file?: { buffer: Buffer; filename?: string; contentType?: string; field?: string },
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----test${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? "file"}"; filename="${
          file.filename ?? "photo.jpg"
        }"\r\nContent-Type: ${file.contentType ?? "image/jpeg"}\r\n\r\n`,
      ),
      file.buffer,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/** A 2000x1000 JPEG with EXIF (camera make, orientation 6 = rotate 90° CW, GPS position). */
export function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#336699" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "TestCam" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 52/1 0/1" },
    })
    .toBuffer();
}

export function smallPng(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 300, channels: 4, background: "#5b3fd1" } })
    .png()
    .toBuffer();
}
