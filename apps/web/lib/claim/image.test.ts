import { describe, expect, it } from "vitest";
import { planResize } from "./image";

const MB = 1024 * 1024;

describe("planResize", () => {
  it("shrinks a 12 MP phone photo to 1600 px on the long edge as JPEG", () => {
    expect(planResize({ width: 4032, height: 3024, bytes: 3.2 * MB, type: "image/jpeg" })).toEqual({
      resize: true,
      width: 1600,
      height: 1200,
      type: "image/jpeg",
      quality: 0.82,
    });
  });

  it("keeps a portrait photo upright", () => {
    expect(
      planResize({ width: 3024, height: 4032, bytes: 3.2 * MB, type: "image/jpeg" }),
    ).toMatchObject({
      width: 1200,
      height: 1600,
    });
  });

  it("sends a small photo as it is", () => {
    expect(planResize({ width: 800, height: 600, bytes: 200_000, type: "image/jpeg" })).toEqual({
      resize: false,
    });
  });

  it("re-encodes a small but heavy image at its own size", () => {
    expect(
      planResize({ width: 1200, height: 900, bytes: 3 * MB, type: "image/png" }),
    ).toMatchObject({
      resize: true,
      width: 1200,
      height: 900,
      type: "image/jpeg",
    });
  });

  it("re-encodes a format the server may not read, like HEIC", () => {
    expect(
      planResize({ width: 800, height: 600, bytes: 200_000, type: "image/heic" }),
    ).toMatchObject({
      resize: true,
      type: "image/jpeg",
    });
  });

  it("sends the file as it is when the size is unknown", () => {
    expect(planResize({ width: 0, height: 0, bytes: 200_000, type: "image/jpeg" })).toEqual({
      resize: false,
    });
  });
});
