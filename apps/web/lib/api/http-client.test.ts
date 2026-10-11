import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { createHttpApiClient } from "./http-client";

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("createHttpApiClient", () => {
  it("calls the contract path on the configured server and returns the body", async () => {
    const fetch = respond(200, { code: "7Q2K", state: "open" });
    const api = createHttpApiClient({ baseUrl: "https://pledge.example", fetch });

    const claim = await api.getClaim("7Q2K");

    expect(fetch).toHaveBeenCalledWith("https://pledge.example/claim/7Q2K", expect.objectContaining({ method: "GET", credentials: "include" }));
    expect(claim.state).toBe("open");
  });

  it("turns an error response into an ApiError with the contract error code", async () => {
    const fetch = respond(409, { error: "already_claimed", message: "Someone else claimed this first." });
    const api = createHttpApiClient({ baseUrl: "", fetch });

    const error = await api.claimSubtask("7Q2K").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "already_claimed", message: "Someone else claimed this first." });
  });

  it("reports a non-JSON error as internal", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("Bad gateway", { status: 502 }));
    const api = createHttpApiClient({ baseUrl: "", fetch });

    const error = await api.getBoardState().catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 502, code: "internal" });
  });
});
